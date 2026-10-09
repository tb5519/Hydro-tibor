/* eslint-disable no-await-in-loop -- Daily answers and attachment snapshots are deliberately ordered. */
import { Collection, ObjectId } from 'mongodb';
import { ForbiddenError, NotFoundError, ValidationError } from '../error';
import {
    beijingDay, canRepeat, DAILY_QUIZ_KINDS, DailyQuizPolicy, defaultPolicy, gradeAnswer, parseAnswers, parsePolicy, selectionRank,
} from '../lib/daily_quiz';
import { isScratchDomain } from '../lib/domain_type';
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
        const ddoc = domains.find((doc) => doc._id === item.domainId);
        return member.hasPerm(PERM.PERM_VIEW | (isScratchDomain(ddoc) ? 0n : PERM.PERM_VIEW_PROBLEM)) ? item : null;
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
    if (!DAILY_QUIZ_KINDS.includes(objective.kind)) throw new ValidationError('objective');
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

/** One selector powers real sessions and read-only teacher previews. */
async function selectSessionItems(
    uid: number, policy: DailyQuizPolicy, day: string, round: number, previous: DailyQuizSession | null,
    materialize: (source: any, id: number, domainName: string, points: number) => Promise<QuizItem>,
) {
    const items: QuizItem[] = [];
    for (const rule of policy.domains) {
        const [ddoc, sources, progress] = await Promise.all([
            domain.get(rule.domainId),
            document.getMulti(rule.domainId, document.TYPE_PROBLEM, {
                objectiveKind: { $in: DAILY_QUIZ_KINDS }, reference: { $exists: false },
                ...(rule.tags.length ? { tag: { $in: rule.tags } } : {}),
            }).toArray(),
            progressColl.find({ uid, domainId: rule.domainId }).toArray(),
        ]);
        const history = new Map(progress.map((item) => [item.sourceId, item]));
        // createSession settles the previous round. A preview overlays exactly that
        // effect in memory, without awarding points or writing progress/storage.
        const unsettled = previous && (previous.settledAnswers || 0) < previous.items.filter((item) => item.answer).length;
        for (const item of unsettled ? previous.items : []) {
            if (item.domainId !== rule.domainId || !item.answer) continue;
            const old = history.get(item.sourceId);
            history.set(item.sourceId, {
                _id: `${uid}:${rule.domainId}:${item.sourceId}`, uid, domainId: rule.domainId, sourceId: item.sourceId,
                mastered: !!old?.mastered || item.answer.correct,
                lastRound: Math.max(old?.lastRound || 0, previous.round),
                lastDay: old?.lastDay && old.lastDay > previous.day ? old.lastDay : previous.day,
            });
        }
        const candidates = sources.filter((item) => canRepeat(history.get(item.docId), round, policy.cooldownRounds))
            .sort((a, b) => Number(!!history.get(b.docId)) - Number(!!history.get(a.docId))
                || (history.get(a.docId)?.lastRound || 0) - (history.get(b.docId)?.lastRound || 0)
                || selectionRank(`${uid}:${day}:${rule.domainId}`, a.docId).localeCompare(selectionRank(`${uid}:${day}:${rule.domainId}`, b.docId)));
        let selected = 0;
        for (const source of candidates) {
            if (selected >= rule.count) break;
            try {
                const item = await materialize(source, items.length + 1, ddoc?.name || rule.domainId, rule.points[selected]);
                items.push(item);
                selected++;
            } catch { /* Invalid or missing source assets must not block entry for the learner. */ }
        }
    }
    return items;
}

async function createSession(uid: number, policy: DailyQuizPolicy, now: Date) {
    const day = beijingDay(now);
    const previous = await sessionColl.find({ uid }).sort({ day: -1 }).limit(1).next();
    // Reconcile an interrupted prior-day answer before selecting from mastery.
    if (previous) await settleSession(previous); // eslint-disable-line ts/no-use-before-define
    const round = (previous?.round || 0) + 1;
    const assetPrefix = new ObjectId().toHexString();
    const items = await selectSessionItems(uid, policy, day, round, previous,
        (source, id, domainName, points) => snapshotItem(source, id, domainName, points, assetPrefix));
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

export interface AdminQuizSession {
    uid: number;
    day: string;
    items: (Pick<QuizItem, 'domainId' | 'cancelled'> & { answer?: Pick<QuizAnswer, 'correct' | 'earnedPoints' | 'answeredAt'> })[];
}

/** Read only the fields needed for a roster; never load question snapshots here. */
export async function getAdminSessions(uids: number[], startDay: string, endDay: string): Promise<AdminQuizSession[]> {
    if (!uids.length) return [];
    return sessionColl.find({ uid: { $in: uids }, day: { $gte: startDay, $lte: endDay } })
        .project<AdminQuizSession>({
            _id: 0, uid: 1, day: 1, 'items.domainId': 1, 'items.cancelled': 1,
            'items.answer.correct': 1, 'items.answer.earnedPoints': 1, 'items.answer.answeredAt': 1,
        }).toArray();
}

export function summarizeAdminItems(source: AdminQuizSession['items']) {
    const items = source.filter((item) => !item.cancelled || item.answer);
    const answered = items.filter((item) => item.answer);
    const correctCount = answered.filter((item) => item.answer.correct).length;
    const lastAnsweredAt = answered.reduce((latest, item) => Math.max(latest, +new Date(item.answer.answeredAt) || 0), 0);
    return {
        total: items.length, answered: answered.length, correctCount, wrongCount: answered.length - correctCount,
        earnedPoints: answered.reduce((sum, item) => sum + item.answer.earnedPoints, 0),
        accuracy: answered.length ? correctCount / answered.length * 100 : null,
        completed: items.length > 0 && answered.length === items.length,
        lastAnsweredAt: lastAnsweredAt ? new Date(lastAnsweredAt).toISOString() : null,
    };
}

export interface AdminQuizMaterial {
    domainId: string;
    sourceId: number;
    tags: string[];
}

interface AdminQuizHistory extends Omit<AdminQuizSession, 'items'> {
    _id: string;
    round: number;
    items: (AdminQuizSession['items'][number] & Pick<QuizItem, 'id' | 'sourceId'>)[];
}

interface AdminQuizLatestAnswer {
    sessionId: string;
    day: string;
    round: number;
    itemId: number;
    answer: NonNullable<AdminQuizSession['items'][number]['answer']>;
}

export interface AdminQuizLearningState {
    uid: number;
    enabled: boolean;
    configuredTags: string[];
    pool: AdminQuizMaterial[];
    latest: Map<string, AdminQuizLatestAnswer>;
    summary: {
        total: number; answered: number; correctCount: number; wrongCount: number; unseenCount: number;
        accuracy: number | null; participationCount: number; earnedPoints: number; lastAnsweredAt: string | null;
    };
    tags: {
        domainId: string; domainName: string; name: string; total: number;
        answered: number; correctCount: number; wrongCount: number; accuracy: number | null;
    }[];
    sessions: ({ id: string, round: number, day: string } & ReturnType<typeof summarizeAdminItems>)[];
}

export function adminQuizSourceKey(item: Pick<AdminQuizMaterial, 'domainId' | 'sourceId'>) {
    return `${item.domainId}:${item.sourceId}`;
}

function latestAnswerOrder(answer: AdminQuizLatestAnswer, previous: AdminQuizLatestAnswer) {
    const timestamp = (item: AdminQuizLatestAnswer) => +new Date(item.answer.answeredAt) || +new Date(item.day);
    return timestamp(answer) - timestamp(previous) || answer.round - previous.round
        || answer.day.localeCompare(previous.day) || answer.itemId - previous.itemId;
}

/** Current configured pools and compact history are shared by both teacher views. No session is created or settled. */
export async function getAdminLearningBatch(
    students: { uid: number, domainIds: string[] }[], domains: { id: string, name: string }[],
) {
    const uids = students.map((student) => student.uid);
    const domainIds = [...new Set(students.flatMap((student) => student.domainIds))];
    const [configs, sources, history] = await Promise.all([
        listConfigs(uids),
        domainIds.length ? document.coll.find({
            domainId: { $in: domainIds }, docType: document.TYPE_PROBLEM,
            objectiveKind: { $in: DAILY_QUIZ_KINDS }, reference: { $exists: false },
        }).project({ domainId: 1, docId: 1, tag: 1, objective: 1 }).toArray() : [],
        uids.length ? sessionColl.find({ uid: { $in: uids } }).project<AdminQuizHistory>({
            _id: 1, uid: 1, day: 1, round: 1, 'items.id': 1, 'items.domainId': 1, 'items.sourceId': 1, 'items.cancelled': 1,
            'items.answer.correct': 1, 'items.answer.earnedPoints': 1, 'items.answer.answeredAt': 1,
        }).toArray() : [],
    ]);
    const catalogue: AdminQuizMaterial[] = [];
    for (const source of sources) {
        try {
            parseObjective(JSON.stringify(source.objective));
            catalogue.push({
                domainId: source.domainId, sourceId: source.docId,
                tags: Array.isArray(source.tag) ? [...new Set<string>(source.tag.filter((tag) => typeof tag === 'string'))] : [],
            });
        } catch { /* Invalid source material is not part of an assigned question pool. */ }
    }
    const domainNames = new Map(domains.map((item) => [item.id, item.name]));
    const historyByUid = new Map<number, AdminQuizHistory[]>();
    for (const session of history) {
        const entries = historyByUid.get(session.uid) || [];
        entries.push(session);
        historyByUid.set(session.uid, entries);
    }
    const byUid = new Map<number, AdminQuizLearningState>();
    for (const student of students) {
        const policy = configs[student.uid] || defaultPolicy();
        // Pausing the global switch stops future assignments without erasing the configured learning scope.
        const rules = policy.domains.filter((rule) => rule.enabled && student.domainIds.includes(rule.domainId));
        const rulesByDomain = new Map(rules.map((rule) => [rule.domainId, rule]));
        const pool = catalogue.filter((item) => {
            const rule = rulesByDomain.get(item.domainId);
            return rule && (!rule.tags.length || item.tags.some((tag) => rule.tags.includes(tag)));
        });
        const keys = new Set(pool.map(adminQuizSourceKey));
        const latest = new Map<string, AdminQuizLatestAnswer>();
        const sessions: AdminQuizLearningState['sessions'] = [];
        let participationCount = 0;
        let earnedPoints = 0;
        for (const session of historyByUid.get(student.uid) || []) {
            const items = session.items.filter((item) => keys.has(adminQuizSourceKey(item)) && (!item.cancelled || item.answer));
            if (!items.length) continue;
            const summary = summarizeAdminItems(items);
            sessions.push({ id: session._id, round: session.round, day: session.day, ...summary });
            participationCount += Number(summary.answered > 0);
            earnedPoints += summary.earnedPoints;
            for (const item of items) {
                if (!item.answer) continue;
                const key = adminQuizSourceKey(item);
                const candidate = {
                    sessionId: session._id, day: session.day, round: session.round, itemId: item.id, answer: item.answer,
                };
                const previous = latest.get(key);
                if (!previous || latestAnswerOrder(candidate, previous) > 0) latest.set(key, candidate);
            }
        }
        sessions.sort((a, b) => b.round - a.round || b.day.localeCompare(a.day));
        const answered = latest.size;
        const correctCount = [...latest.values()].filter((item) => item.answer.correct).length;
        const lastAnsweredAt = [...latest.values()].reduce((value, item) => Math.max(value, +new Date(item.answer.answeredAt) || 0), 0);
        const tagGroups = new Map<string, { domainId: string, name: string, questions: AdminQuizMaterial[] }>();
        for (const rule of rules) {
            for (const name of rule.tags) tagGroups.set(`${rule.domainId}:${name}`, { domainId: rule.domainId, name, questions: [] });
        }
        for (const item of pool) {
            const selected = rulesByDomain.get(item.domainId).tags;
            const tags = selected.length ? item.tags.filter((tag) => selected.includes(tag)) : item.tags;
            for (const name of tags.length ? tags : ['未标注知识点']) {
                const key = `${item.domainId}:${name}`;
                const group = tagGroups.get(key) || { domainId: item.domainId, name, questions: [] };
                group.questions.push(item);
                tagGroups.set(key, group);
            }
        }
        const tags = [...tagGroups.values()].map((group) => {
            const answers = group.questions.map((item) => latest.get(adminQuizSourceKey(item))).filter(Boolean);
            const correct = answers.filter((item) => item.answer.correct).length;
            return {
                domainId: group.domainId, domainName: domainNames.get(group.domainId) || group.domainId, name: group.name,
                total: group.questions.length, answered: answers.length, correctCount: correct, wrongCount: answers.length - correct,
                accuracy: answers.length ? correct / answers.length * 100 : null,
            };
        }).sort((a, b) => a.domainName.localeCompare(b.domainName, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN'));
        byUid.set(student.uid, {
            uid: student.uid, enabled: policy.enabled && rules.length > 0,
            configuredTags: [...new Set(rules.flatMap((rule) => rule.tags))], pool, latest, tags, sessions,
            summary: {
                total: pool.length, answered, correctCount, wrongCount: answered - correctCount, unseenCount: pool.length - answered,
                accuracy: answered ? correctCount / answered * 100 : null, participationCount, earnedPoints,
                lastAnsweredAt: lastAnsweredAt ? new Date(lastAnsweredAt).toISOString() : null,
            },
        });
    }
    return { configs, catalogue, byUid };
}

function presentAdminQuizItem(item: QuizItem, index: number, session: Pick<DailyQuizSession, '_id' | 'day' | 'round'>) {
    return {
        id: item.id, index, sourceId: item.sourceId, domainId: item.domainId, domainName: item.domainName,
        title: item.title, stem: item.objective.stem, kind: item.objective.kind, tags: item.tags, options: item.objective.options,
        answers: item.objective.answers, selected: item.answer?.selected || null, correct: item.answer?.correct ?? null,
        points: item.points, earnedPoints: item.answer?.earnedPoints || 0, analysis: item.objective.analysis,
        answeredAt: item.answer?.answeredAt, sessionId: session._id, day: session.day, round: session.round,
    };
}

type UpcomingStatus = 'ready' | 'continue' | 'completed' | 'empty' | 'disabled';
interface UpcomingSelection {
    status: UpcomingStatus;
    day: string;
    projected: boolean;
    session: DailyQuizSession | null;
    next?: UpcomingSelection;
}

/** Validate original assets without copy/getMeta, which would update storage bookkeeping. */
async function previewItem(pdoc: any, id: number, domainName: string, points: number): Promise<QuizItem> {
    const objective = parseObjective(JSON.stringify(pdoc.objective));
    if (!DAILY_QUIZ_KINDS.includes(objective.kind)) throw new ValidationError('objective');
    const statementFiles = [...new Set(fileNames([objective.stem, ...objective.options].join('\n')))];
    const names = [...new Set([...statementFiles, ...fileNames(objective.analysis)])];
    const files: Record<string, string> = Object.create(null);
    for (const filename of names) {
        const path = `problem/${pdoc.domainId}/${pdoc.docId}/additional_file/${filename}`;
        if (!await storage.exists(path)) throw new NotFoundError();
        files[filename] = path;
    }
    return {
        id, domainId: pdoc.domainId, domainName, sourceId: pdoc.docId, title: pdoc.title,
        tags: pdoc.tag || [], points, objective, files, statementFiles,
    };
}

async function projectUpcomingSession(uid: number, policy: DailyQuizPolicy, day: string, previous: DailyQuizSession | null) {
    const round = (previous?.round || 0) + 1;
    const items = await selectSessionItems(uid, policy, day, round, previous, previewItem);
    return {
        _id: `${uid}-${day}`, uid, day, round, cooldownRounds: policy.cooldownRounds, items, cursor: 0,
        requested: policy.domains.reduce((sum, rule) => sum + rule.count, 0), createdAt: new Date(),
    } satisfies DailyQuizSession;
}

async function selectAdminUpcoming(uid: number, now: Date): Promise<UpcomingSelection> {
    const day = beijingDay(now);
    const policy = await effectivePolicy(uid);
    if (!policy.enabled || !policy.domains.length) return { status: 'disabled', day, projected: false, session: null };
    const today = await sessionColl.findOne({ _id: `${uid}-${day}`, uid });
    if (!today) {
        const previous = await sessionColl.find({ uid }).sort({ day: -1 }).limit(1).next();
        const session = await projectUpcomingSession(uid, policy, day, previous);
        return { status: session.items.length ? 'ready' : 'empty', day, projected: true, session };
    }
    const allowed = new Set(policy.domains.map((rule) => rule.domainId));
    // Reproduce getSession's domain cancellation and cursor advancement in memory.
    for (const item of today.items) if (!allowed.has(item.domainId)) item.cancelled = true;
    while (today.cursor < today.items.length && today.items[today.cursor].cancelled) today.cursor++;
    const active = today.items.filter((item) => !item.cancelled);
    if (active.some((item) => !item.answer)) return { status: 'continue', day, projected: false, session: today };
    const tomorrow = beijingDay(new Date(now.getTime() + 86400000));
    const next = await projectUpcomingSession(uid, policy, tomorrow, today);
    return {
        status: active.length ? 'completed' : 'empty', day, projected: false, session: today,
        next: { status: next.items.length ? 'ready' : 'empty', day: tomorrow, projected: true, session: next },
    };
}

export interface AdminQuizUpcoming {
    status: UpcomingStatus;
    day: string;
    projected: boolean;
    checkedAt: string;
    requested: number;
    total: number;
    remaining: number;
    currentQuestionId: number | null;
    items: (ReturnType<typeof presentAdminQuizItem> & { current: boolean, awaitingAcknowledgement: boolean })[];
    next?: AdminQuizUpcoming;
}

/** A teacher read must never create a round, copy attachments, or settle answers. */
export async function getAdminUpcoming(uid: number, classroom = '', now = new Date()): Promise<AdminQuizUpcoming> {
    const present = (selection: UpcomingSelection): AdminQuizUpcoming => {
        const { session } = selection;
        const remaining = ['ready', 'continue'].includes(selection.status)
            ? session?.items.slice(session.cursor).filter((item) => !item.cancelled) || [] : [];
        return {
            status: selection.status, day: selection.day, projected: selection.projected, checkedAt: now.toISOString(),
            requested: session?.requested || 0, total: session?.items.filter((item) => !item.cancelled).length || 0,
            remaining: remaining.length, currentQuestionId: remaining[0]?.id || null,
            items: remaining.filter((item) => !classroom || item.domainId === classroom).map((item) => ({
                ...presentAdminQuizItem(item, session.items.indexOf(item) + 1, session),
                current: item.id === remaining[0]?.id, awaitingAcknowledgement: !!item.answer,
            })),
            ...(selection.next ? { next: present(selection.next) } : {}),
        };
    };
    return present(await selectAdminUpcoming(uid, now));
}

/** Recompute the authorized selection so guessed source IDs cannot reveal other material. */
export async function getAdminUpcomingFile(
    uid: number, day: string, sourceDomain: string, sourceId: number, questionId: number, filename: string, now = new Date(),
) {
    const preview = await selectAdminUpcoming(uid, now);
    const selected = [preview, preview.next].find((item) => item?.day === day);
    if (!selected || !['ready', 'continue'].includes(selected.status)) throw new NotFoundError();
    const item = selected.session?.items.slice(selected.session.cursor).find((value) => value.id === questionId && !value.cancelled);
    if (!item || item.domainId !== sourceDomain || item.sourceId !== sourceId
        || !Object.hasOwn(item.files, filename)) throw new NotFoundError();
    return item.files[filename];
}

export async function getAdminLearningDetail(state: AdminQuizLearningState) {
    const ids = [...new Set([...state.latest.values()].map((item) => item.sessionId))];
    const snapshots = ids.length ? await sessionColl.find({ uid: state.uid, _id: { $in: ids } }).toArray() : [];
    const byId = new Map(snapshots.map((session) => [session._id, session]));
    const questions: ReturnType<typeof presentAdminQuizItem>[] = [];
    const materialsByKey = new Map(state.pool.map((material) => [adminQuizSourceKey(material), material]));
    for (const [key, latest] of state.latest) {
        const session = byId.get(latest.sessionId);
        const item = session?.items.find((candidate) => candidate.id === latest.itemId && adminQuizSourceKey(candidate) === key);
        if (item?.answer) questions.push({
            ...presentAdminQuizItem(item, questions.length + 1, session),
            tags: materialsByKey.get(key)?.tags || item.tags,
        });
    }
    questions.sort((a, b) => +new Date(b.answeredAt) - +new Date(a.answeredAt) || b.round - a.round || a.sourceId - b.sourceId);
    questions.forEach((item, index) => { item.index = index + 1; });
    return { summary: state.summary, tags: state.tags, questions, sessions: state.sessions };
}

export async function getAdminLearningSession(state: AdminQuizLearningState, sessionId: string) {
    if (!state.sessions.some((session) => session.id === sessionId)) throw new NotFoundError();
    const session = await sessionColl.findOne({ _id: sessionId, uid: state.uid });
    if (!session) throw new NotFoundError();
    const keys = new Set(state.pool.map(adminQuizSourceKey));
    const items = session.items.filter((item) => keys.has(adminQuizSourceKey(item)) && (!item.cancelled || item.answer));
    return {
        id: session._id, round: session.round, day: session.day, ...summarizeAdminItems(items),
        items: items.map((item, index) => presentAdminQuizItem(item, index + 1, session)),
    };
}

export async function getAdminDay(uid: number, day = beijingDay(), allowedDomainIds?: string[]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) throw new ValidationError('quizDay');
    const session = await sessionColl.findOne({ _id: `${uid}-${day}` });
    const items = (session?.items || []).filter((item) => (!item.cancelled || item.answer)
        && (!allowedDomainIds || allowedDomainIds.includes(item.domainId))).map((item, index) => ({
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
        earnedPoints: answered.reduce((sum, item) => sum + item.earnedPoints, 0),
        completed: items.length > 0 && answered.length === items.length, items,
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
export async function getAdminFile(uid: number, day: string, questionId: number, filename: string, allowedDomainIds?: string[]) {
    const session = await sessionColl.findOne({ _id: `${uid}-${day}` });
    const item = session?.items.find((value) => value.id === questionId);
    if (!item || (allowedDomainIds && !allowedDomainIds.includes(item.domainId))
        || !Object.hasOwn(item.files, filename)) throw new NotFoundError();
    return item.files[filename];
}

/** Revalidate one protected snapshot against the current pool without reading the student's entire history. */
export async function getAdminLearningFile(uid: number, day: string, questionId: number, filename: string, allowedDomainIds: string[]) {
    const session = await sessionColl.findOne({ _id: `${uid}-${day}`, uid }, { projection: { items: { $elemMatch: { id: questionId } } } });
    const item = session?.items?.[0];
    if (!item || !allowedDomainIds.includes(item.domainId) || (item.cancelled && !item.answer)
        || !Object.hasOwn(item.files, filename)) throw new NotFoundError();
    const [policy, source] = await Promise.all([
        getPolicy(uid),
        document.coll.findOne({
            domainId: item.domainId, docType: document.TYPE_PROBLEM, docId: item.sourceId,
            objectiveKind: { $in: DAILY_QUIZ_KINDS }, reference: { $exists: false },
        }, { projection: { tag: 1, objective: 1 } }),
    ]);
    const rule = policy.domains.find((candidate) => candidate.domainId === item.domainId && candidate.enabled);
    const tags = Array.isArray(source?.tag) ? source.tag : [];
    if (!source || !rule || (rule.tags.length && !tags.some((tag) => rule.tags.includes(tag)))) throw new NotFoundError();
    try { parseObjective(JSON.stringify(source.objective)); } catch { throw new NotFoundError(); }
    return item.files[filename];
}

export async function apply() {
    await db.ensureIndexes(sessionColl, { key: { uid: 1, day: -1 }, name: 'uid_day', unique: true });
    await db.ensureIndexes(progressColl, { key: { uid: 1, domainId: 1, sourceId: 1 }, name: 'uid_source', unique: true });
}
