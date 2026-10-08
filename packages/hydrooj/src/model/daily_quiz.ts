/* eslint-disable no-await-in-loop -- Daily answers and attachment snapshots are deliberately ordered. */
import { Collection, ObjectId } from 'mongodb';
import { ForbiddenError, NotFoundError, ValidationError } from '../error';
import {
    beijingDay, canRepeat, DailyQuizPolicy, defaultPolicy, gradeAnswer, parseAnswers, parsePolicy, selectionRank,
} from '../lib/daily_quiz';
import { ObjectiveQuestion, parseObjective } from '../lib/objective';
import {
    ensureGlobalPointLotteryState, POINT_LOTTERY_POINTS_FIELD, POINT_LOTTERY_TOTAL_POINTS_FIELD, pointLotteryUserColl,
} from '../lib/point_lottery';
import db from '../service/db';
import { PERM, PRIV } from './builtin';
import * as document from './document';
import domain from './domain';
import storage from './storage';
import user, { deleteUserCache } from './user';
import workspace from './workspace';

interface QuizAnswer { selected: string[], correct: boolean, earnedPoints: number, answeredAt: Date }
interface QuizItem {
    id: number;
    domainId: string;
    domainName: string;
    sourceId: number;
    title: string;
    tags: string[];
    points: number;
    objective: ObjectiveQuestion;
    files: Record<string, string>;
    statementFiles: string[];
    answer?: QuizAnswer;
    cancelled?: boolean;
}
export interface DailyQuizSession {
    _id: string;
    uid: number;
    day: string;
    round: number;
    cooldownRounds: number;
    items: QuizItem[];
    cursor: number;
    requested: number;
    createdAt: Date;
    settledAnswers?: number;
}
interface QuizConfig { _id: number, policy: DailyQuizPolicy, updatedAt: Date, updatedBy: number }
interface QuizProgress {
    _id: string;
    uid: number;
    domainId: string;
    sourceId: number;
    mastered: boolean;
    lastRound: number;
    lastDay: string;
}
declare module '../service/db' {
    interface Collections {
        'daily.quiz.config': QuizConfig;
        'daily.quiz.session': DailyQuizSession;
        'daily.quiz.progress': QuizProgress;
    }
}
export const configColl = db.collection('daily.quiz.config');
export const sessionColl = db.collection('daily.quiz.session');
export const progressColl = db.collection('daily.quiz.progress');

export async function getPolicy(uid: number): Promise<DailyQuizPolicy> {
    return (await configColl.findOne({ _id: uid }))?.policy || defaultPolicy();
}

export async function savePolicy(uid: number, policy: DailyQuizPolicy, actor: number) {
    const valid = parsePolicy(policy, policy.domains.map((item) => item.domainId));
    await configColl.updateOne({ _id: uid }, { $set: { policy: valid, updatedAt: new Date(), updatedBy: actor } }, { upsert: true });
    return valid;
}

export async function listConfigs(uids: number[]): Promise<Record<number, DailyQuizPolicy>> {
    const docs = await configColl.find({ _id: { $in: uids } }).toArray();
    return Object.fromEntries(docs.map((doc) => [doc._id, doc.policy]));
}

/** Recheck memberships on every request, including an already-created session. */
export async function effectivePolicy(uid: number) {
    const policy = await getPolicy(uid);
    if (!policy.enabled) return { ...policy, domains: [] };
    const account = await pointLotteryUserColl.findOne({ _id: uid }, { projection: { priv: 1 } });
    if (uid <= 1 || !account || !(account.priv & PRIV.PRIV_USER_PROFILE)
        || account.priv & (PRIV.PRIV_EDIT_SYSTEM | PRIV.PRIV_JUDGE)
        || await workspace.isAssignedToOtherWorkspace(uid, workspace.LEGACY_WORKSPACE_ID)) return defaultPolicy();
    const memberships = await domain.collUser.find({ uid, join: true, blockedByStudentManagement: { $ne: true } })
        .project({ domainId: 1 }).toArray();
    const domains = await domain.coll.find({
        $and: [{ _id: { $in: memberships.map((item) => item.domainId) } }, workspace.getDomainQuery(workspace.LEGACY_WORKSPACE_ID)],
    }).toArray();
    const candidates = policy.domains.filter((item) => item.enabled && domains.some((doc) => doc._id === item.domainId));
    const permitted = await Promise.all(candidates.map(async (item) => {
        const member = await user.getById(item.domainId, uid);
        return member.hasPerm(PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM) ? item : null;
    }));
    return { ...policy, domains: permitted.filter(Boolean) };
}

function fileNames(text: string) {
    return [...text.matchAll(/file:\/\/([^\s<>"')\]]+)/g)].map((match) => {
        let filename: string;
        try {
            filename = decodeURIComponent(match[1].split(/[?#]/)[0]);
        } catch { throw new ValidationError('file'); }
        if (!filename || /[/\\\0]/.test(filename) || filename === '.' || filename === '..') throw new ValidationError('file');
        return filename;
    });
}

async function snapshotItem(pdoc: any, id: number, domainName: string, points: number, assetPrefix: string): Promise<QuizItem> {
    const objective = parseObjective(JSON.stringify(pdoc.objective));
    if (!['single', 'multiple'].includes(objective.kind)) throw new ValidationError('objective');
    const statementFiles = [...new Set(fileNames([objective.stem, ...objective.options].join('\n')))];
    const names = [...new Set([...statementFiles, ...fileNames(objective.analysis)])];
    const files: Record<string, string> = Object.create(null);
    try {
        for (const filename of names) {
            const target = `daily-quiz/${assetPrefix}/${id}/${filename}`;
            await storage.copy(`problem/${pdoc.domainId}/${pdoc.docId}/additional_file/${filename}`, target);
            files[filename] = target;
        }
    } catch (error) {
        await storage.del(Object.values(files));
        throw error;
    }
    return {
        id, domainId: pdoc.domainId, domainName, sourceId: pdoc.docId, title: pdoc.title,
        tags: pdoc.tag || [], points, objective, files, statementFiles,
    };
}

async function createSession(uid: number, policy: DailyQuizPolicy, now: Date) {
    const day = beijingDay(now);
    const previous = await sessionColl.find({ uid }).sort({ day: -1 }).limit(1).next();
    // Reconcile an interrupted prior-day answer before selecting from mastery.
    if (previous) await settleSession(previous); // eslint-disable-line ts/no-use-before-define
    const round = (previous?.round || 0) + 1;
    const items: QuizItem[] = [];
    const assetPrefix = new ObjectId().toHexString();
    for (const rule of policy.domains) {
        const [ddoc, sources, progress] = await Promise.all([
            domain.get(rule.domainId),
            document.getMulti(rule.domainId, document.TYPE_PROBLEM, {
                objectiveKind: { $in: ['single', 'multiple'] }, reference: { $exists: false },
                ...(rule.tags.length ? { tag: { $in: rule.tags } } : {}),
            }).toArray(),
            progressColl.find({ uid, domainId: rule.domainId }).toArray(),
        ]);
        const history = new Map(progress.map((item) => [item.sourceId, item]));
        const candidates = sources.filter((item) => canRepeat(history.get(item.docId), round, policy.cooldownRounds))
            .sort((a, b) => Number(!!history.get(b.docId)) - Number(!!history.get(a.docId))
                || (history.get(a.docId)?.lastRound || 0) - (history.get(b.docId)?.lastRound || 0)
                || selectionRank(`${uid}:${day}:${rule.domainId}`, a.docId).localeCompare(selectionRank(`${uid}:${day}:${rule.domainId}`, b.docId)));
        let selected = 0;
        for (const source of candidates) {
            if (selected >= rule.count) break;
            try {
                const item = await snapshotItem(source, items.length + 1, ddoc?.name || rule.domainId, rule.points[selected], assetPrefix);
                items.push(item);
                selected++;
            } catch { /* Invalid or missing source assets must not block entry for the learner. */ }
        }
    }
    const session: DailyQuizSession = {
        _id: `${uid}-${day}`, uid, day, round, cooldownRounds: policy.cooldownRounds, items, cursor: 0,
        requested: policy.domains.reduce((sum, rule) => sum + rule.count, 0), createdAt: now,
    };
    try { await sessionColl.insertOne(session); } catch (error) {
        await storage.del(items.flatMap((item) => Object.values(item.files)));
        if (error.code !== 11000) throw error;
        return sessionColl.findOne({ _id: session._id });
    }
    return session;
}

/** Balances and the day's high-water mark change in the same account update. */
export async function settleSession(session: DailyQuizSession) {
    const answered = session.items.filter((item) => item.answer);
    if ((session.settledAnswers || 0) >= answered.length) return;
    const earned = answered.reduce((sum, item) => sum + item.answer.earnedPoints, 0);
    if (earned) {
        await ensureGlobalPointLotteryState(session.uid);
        const field = `dailyQuizPointAwards.${session.day}`;
        const previous = { $ifNull: [`$${field}`, 0] };
        const delta = { $subtract: [earned, previous] };
        const result = await (pointLotteryUserColl as Collection<any>).updateOne({
            _id: session.uid, $expr: { $lt: [previous, earned] },
        }, [{ $set: {
            [POINT_LOTTERY_POINTS_FIELD]: { $add: [{ $ifNull: [`$${POINT_LOTTERY_POINTS_FIELD}`, 0] }, delta] },
            [POINT_LOTTERY_TOTAL_POINTS_FIELD]: { $add: [{ $ifNull: [`$${POINT_LOTTERY_TOTAL_POINTS_FIELD}`, 0] }, delta] },
            [field]: earned,
        } }]);
        if (result.modifiedCount) deleteUserCache(await pointLotteryUserColl.findOne({ _id: session.uid }));
    }
    for (const item of answered) {
        await progressColl.updateOne({ _id: `${session.uid}:${item.domainId}:${item.sourceId}` }, [{ $set: {
            uid: session.uid, domainId: item.domainId, sourceId: item.sourceId,
            mastered: { $or: [{ $ifNull: ['$mastered', false] }, item.answer.correct] },
            lastRound: { $max: [{ $ifNull: ['$lastRound', 0] }, session.round] },
            lastDay: { $max: [{ $ifNull: ['$lastDay', ''] }, session.day] },
        } }], { upsert: true });
    }
    await sessionColl.updateOne({ _id: session._id }, { $max: { settledAnswers: answered.length } });
}

export async function getSession(uid: number, now = new Date()) {
    const policy = await effectivePolicy(uid);
    if (!policy.enabled || !policy.domains.length) return { policy, session: null };
    let session = await sessionColl.findOne({ _id: `${uid}-${beijingDay(now)}` });
    session ||= await createSession(uid, policy, now);
    const allowed = new Set(policy.domains.map((item) => item.domainId));
    for (const [index, item] of session.items.entries()) {
        if (!allowed.has(item.domainId) && !item.cancelled) {
            await sessionColl.updateOne({ _id: session._id }, { $set: { [`items.${index}.cancelled`]: true } });
            item.cancelled = true;
        }
    }
    while (session.cursor < session.items.length && session.items[session.cursor].cancelled) session.cursor++;
    await sessionColl.updateOne({ _id: session._id }, { $max: { cursor: session.cursor } });
    await settleSession(session);
    return { policy, session };
}

export async function answerQuestion(uid: number, sessionId: unknown, questionId: unknown, input: unknown, now = new Date()) {
    const { policy, session } = await getSession(uid, now);
    if (!session || session._id !== sessionId) throw new ForbiddenError('本次每日问答已失效，请刷新');
    const id = Number(questionId);
    if (!Number.isSafeInteger(id)) throw new ValidationError('questionId');
    const index = session.items.findIndex((item) => item.id === id);
    const item = session.items[index];
    if (!item || item.cancelled) throw new NotFoundError();
    if (item.answer) return { policy, session };
    if (index !== session.cursor) throw new ForbiddenError('请按顺序完成每日问答');
    const selected = parseAnswers(input, item.objective);
    const correct = gradeAnswer(item.objective, selected);
    const answer = { selected, correct, earnedPoints: correct ? item.points : 0, answeredAt: now };
    await sessionColl.updateOne({
        _id: session._id, cursor: index, [`items.${index}.answer`]: { $exists: false }, [`items.${index}.cancelled`]: { $ne: true },
    }, { $set: { [`items.${index}.answer`]: answer } });
    const updated = await sessionColl.findOne({ _id: session._id });
    await settleSession(updated);
    return { policy, session: updated };
}

export async function nextQuestion(uid: number, sessionId: unknown, questionId: unknown, now = new Date()) {
    const { session } = await getSession(uid, now);
    if (!session || session._id !== sessionId) throw new ForbiddenError('本次每日问答已失效，请刷新');
    const item = session.items[session.cursor];
    if (item?.id === Number(questionId)) {
        if (!item.answer) throw new ValidationError('answers', null, '请先提交这道题的答案');
        await sessionColl.updateOne({ _id: session._id, cursor: session.cursor }, { $inc: { cursor: 1 } });
    }
    return getSession(uid, now);
}

function publicText(text: string, session: DailyQuizSession, item: QuizItem) {
    return text.replace(/file:\/\/([^\s<>"')\]]+)/g, (_, encoded: string) => {
        const filename = decodeURIComponent(encoded.split(/[?#]/)[0]);
        return `/daily-quiz/${encodeURIComponent(session._id)}/file/${item.id}/${encodeURIComponent(filename)}`;
    });
}

export function presentSession(policy: DailyQuizPolicy, session: DailyQuizSession | null, now = new Date()) {
    const items = session?.items.filter((item) => !item.cancelled) || [];
    const answered = items.filter((item) => item.answer);
    const completed = items.length === answered.length;
    const item = session?.items[session.cursor];
    const current = item && !item.cancelled ? {
        id: item.id, position: items.indexOf(item) + 1, total: items.length,
        domainId: item.domainId, domainName: item.domainName, kind: item.objective.kind, title: item.title,
        stem: publicText(item.objective.stem, session, item),
        options: item.objective.options.map((text) => publicText(text, session, item)), tags: item.tags, points: item.points,
        ...(item.answer ? { feedback: {
            correct: item.answer.correct, answers: item.objective.answers, selectedAnswers: item.answer.selected,
            analysis: publicText(item.objective.analysis, session, item), earnedPoints: item.answer.earnedPoints,
        } } : {}),
    } : null;
    return {
        sessionId: session?._id || '', day: session?.day || beijingDay(now), round: session?.round || 0,
        enabled: policy.enabled, required: policy.enabled && !completed, completed, total: items.length,
        answered: answered.length, earnedPoints: answered.reduce((sum, value) => sum + value.answer.earnedPoints, 0),
        possiblePoints: items.reduce((sum, value) => sum + value.points, 0), current,
        shortage: Math.max(0, (session?.requested || 0) - items.length),
    };
}

export async function getSessionFile(uid: number, sessionId: string, questionId: number, filename: string) {
    const { session } = await getSession(uid);
    if (!session || session._id !== sessionId) throw new NotFoundError();
    const item = session.items.find((value) => value.id === questionId);
    if (!item || item.cancelled || (!item.answer && item.id !== session.items[session.cursor]?.id)
        || (!item.answer && !item.statementFiles.includes(filename)) || !Object.hasOwn(item.files, filename)) throw new NotFoundError();
    return item.files[filename];
}

export async function getAdminSummary(uid: number) {
    const statsStages: any[] = [
        { $match: { uid } },
        { $project: { day: 1, items: { $filter: {
            input: '$items', as: 'item', cond: { $or: [{ $ne: ['$$item.cancelled', true] }, { $ifNull: ['$$item.answer', false] }] },
        } } } },
        { $project: {
            day: 1, total: { $size: '$items' },
            answered: { $size: { $filter: { input: '$items', as: 'item', cond: { $ifNull: ['$$item.answer', false] } } } },
            correctCount: { $size: { $filter: { input: '$items', as: 'item', cond: { $eq: ['$$item.answer.correct', true] } } } },
            earnedPoints: { $sum: '$items.answer.earnedPoints' },
        } },
        { $set: { id: '$_id', completed: { $eq: ['$total', '$answered'] } } },
    ];
    const [totals, recentSessions, recentMistakes, masteredCount] = await Promise.all([
        sessionColl.aggregate([...statsStages, { $group: {
            _id: null, completedDays: { $sum: { $cond: ['$completed', 1, 0] } }, answeredCount: { $sum: '$answered' },
            correctCount: { $sum: '$correctCount' }, wrongCount: { $sum: { $subtract: ['$answered', '$correctCount'] } },
            earnedPoints: { $sum: '$earnedPoints' },
        } }, { $project: { _id: 0 } }]).next(),
        sessionColl.aggregate([{ $match: { uid } }, { $sort: { day: -1 } }, { $limit: 30 }, ...statsStages]).toArray(),
        sessionColl.aggregate([
            { $match: { uid } }, { $unwind: '$items' }, { $match: { 'items.answer.correct': false } },
            { $sort: { 'items.answer.answeredAt': -1 } }, { $limit: 20 },
            { $project: {
                _id: 0, day: 1, domainId: '$items.domainId', title: '$items.title', tags: '$items.tags',
                selected: '$items.answer.selected', answers: '$items.objective.answers', analysis: '$items.objective.analysis',
            } },
        ]).toArray(),
        progressColl.countDocuments({ uid, mastered: true }),
    ]);
    return {
        completedDays: 0, answeredCount: 0, correctCount: 0, wrongCount: 0, earnedPoints: 0, ...totals,
        masteredCount, recentSessions, recentMistakes,
    };
}

export async function getAdminDay(uid: number, day = beijingDay()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) throw new ValidationError('quizDay');
    const session = await sessionColl.findOne({ _id: `${uid}-${day}` });
    const items = (session?.items || []).filter((item) => !item.cancelled || item.answer).map((item, index) => ({
        id: item.id, index: index + 1, domainId: item.domainId, domainName: item.domainName, title: item.title,
        stem: item.objective.stem, kind: item.objective.kind, tags: item.tags, options: item.objective.options,
        answers: item.objective.answers, selected: item.answer?.selected || null, correct: item.answer?.correct ?? null,
        points: item.points, earnedPoints: item.answer?.earnedPoints || 0, analysis: item.objective.analysis,
        answeredAt: item.answer?.answeredAt,
    }));
    const answered = items.filter((item) => item.selected);
    return {
        day, total: items.length, answered: answered.length, correctCount: answered.filter((item) => item.correct).length,
        wrongCount: answered.filter((item) => !item.correct).length,
        earnedPoints: answered.reduce((sum, item) => sum + item.earnedPoints, 0), completed: !!session && answered.length === items.length, items,
    };
}

export async function todayState(uids: number[]) {
    const sessions = await sessionColl.find({ uid: { $in: uids }, day: beijingDay() })
        .project<Pick<DailyQuizSession, 'uid' | 'items'>>({ uid: 1, 'items.answer': 1, 'items.cancelled': 1 }).toArray();
    return Object.fromEntries(sessions.map((session) => {
        const items = session.items.filter((item) => !item.cancelled || item.answer);
        const answered = items.filter((item) => item.answer);
        return [session.uid, {
            total: items.length, answered: answered.length, correctCount: answered.filter((item) => item.answer.correct).length,
            wrongCount: answered.filter((item) => !item.answer.correct).length,
            earnedPoints: answered.reduce((sum, item) => sum + item.answer.earnedPoints, 0), completed: items.length === answered.length,
        }];
    }));
}

export const getTodayStates = todayState;

/** Call only behind the management handler's student scope and sudo checks. */
export async function getAdminFile(uid: number, day: string, questionId: number, filename: string) {
    const session = await sessionColl.findOne({ _id: `${uid}-${day}` });
    const item = session?.items.find((value) => value.id === questionId);
    if (!item || !Object.hasOwn(item.files, filename)) throw new NotFoundError();
    return item.files[filename];
}

export async function apply() {
    await db.ensureIndexes(sessionColl, { key: { uid: 1, day: -1 }, name: 'uid_day', unique: true });
    await db.ensureIndexes(progressColl, { key: { uid: 1, domainId: 1, sourceId: 1 }, name: 'uid_source', unique: true });
}
