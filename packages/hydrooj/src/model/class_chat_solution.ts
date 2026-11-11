import { ObjectId } from 'mongodb';
import type { Context } from '../context';
import { chatId, ClassChatError } from '../lib/class_chat';
import { ChatSolutionContent, emptyChatSolutionAnnotations, validateChatSolution } from '../lib/class_chat_solution';
import db from '../service/db';
import * as chat from './class_chat';

interface SavedSolution extends ChatSolutionContent {
    _id: string; teacherUid: number; workspaceId: string; sourceMessageId: string;
    domainId: string; pid: number; revision: number; updatedAt: Date;
}
declare module '../service/db' {
    interface Collections {
        'class.chat.solution.draft': SavedSolution;
        'class.chat.solution.standard': SavedSolution;
    }
}
export const drafts = db.collection('class.chat.solution.draft');
export const standards = db.collection('class.chat.solution.standard');

export async function teacherSource(uid: number, domainId: string, sourceMessageId: string) {
    const source = await chat.authorizedMessage(uid, domainId, chatId(sourceMessageId));
    if (!source.pair.canTeach || source.item.kind !== 'snapshot' || !source.item.snapshot
        || source.item.from !== source.pair.studentUid || source.item.to !== uid) {
        throw new ClassChatError('FORBIDDEN', '请从学员发来的题目与代码进入讲解。', 403);
    }
    return source;
}
export async function executionMode(uid: number, domainId: string, pid: number, sourceMessageId: string) {
    const source = await teacherSource(uid, domainId, sourceMessageId);
    if (source.item.snapshot.domainId !== domainId || source.item.snapshot.pid !== pid) {
        throw new ClassChatError('FORBIDDEN', '这份讲解与当前题目不一致，请重新打开题解。', 403);
    }
    return chat.snapshotCppEditorMode(source.item.snapshot, source.pair.studentUid);
}
type Source = Awaited<ReturnType<typeof teacherSource>>;
const draftId = (uid: number, source: Source) => JSON.stringify([uid, source.item._id.toHexString()]);
const standardId = (uid: number, source: Source) => JSON.stringify([uid, source.pair.workspaceId, source.item.snapshot.domainId, source.item.snapshot.pid]);
function publicSolution(value: SavedSolution) {
    if (!value) return null;
    return { code: value.code, lang: value.lang, annotations: value.annotations, revision: value.revision, updatedAt: value.updatedAt };
}

export async function solutionState(uid: number, domainId: string, sourceMessageId: string) {
    const source = await teacherSource(uid, domainId, sourceMessageId);
    const [draft, standard] = await Promise.all([
        drafts.findOne({ _id: draftId(uid, source), teacherUid: uid, workspaceId: source.pair.workspaceId }),
        standards.findOne({ _id: standardId(uid, source), teacherUid: uid, workspaceId: source.pair.workspaceId }),
    ]);
    return { draft: publicSolution(draft) || { code: source.item.snapshot.code, lang: source.item.snapshot.lang,
        annotations: emptyChatSolutionAnnotations(), revision: 0, updatedAt: null },
    standard: publicSolution(standard) };
}

async function save(collection: typeof drafts, _id: string, uid: number, source: Source, value: any, revision: any) {
    const content = validateChatSolution(value);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new ClassChatError('INVALID_REVISION', '请先打开最新讲解，再保存。');
    }
    const document: SavedSolution = { ...content, _id, teacherUid: uid, workspaceId: source.pair.workspaceId,
        sourceMessageId: source.item._id.toHexString(), domainId: source.item.snapshot.domainId, pid: source.item.snapshot.pid,
        revision: revision + 1, updatedAt: new Date() };
    if (revision === 0) {
        try { await collection.insertOne(document); }
        catch (error) {
            if (error.code !== 11000) throw error;
            throw new ClassChatError('CONFLICT', '这份讲解已在其他页面保存，请刷新后再操作。', 409);
        }
    } else {
        const result = await collection.replaceOne({ _id, teacherUid: uid, workspaceId: source.pair.workspaceId, revision }, document);
        if (!result.matchedCount) throw new ClassChatError('CONFLICT', '这份讲解已在其他页面更新，请刷新后再操作。', 409);
    }
    return publicSolution(document);
}

export async function saveDraft(uid: number, domainId: string, sourceMessageId: string, content: any, revision: any) {
    const source = await teacherSource(uid, domainId, sourceMessageId);
    return save(drafts, draftId(uid, source), uid, source, content, revision);
}

export async function saveStandard(uid: number, domainId: string, sourceMessageId: string, content: any, revision: any) {
    const source = await teacherSource(uid, domainId, sourceMessageId);
    return save(standards, standardId(uid, source), uid, source, content, revision);
}

export async function loadStandard(uid: number, domainId: string, sourceMessageId: string) {
    const source = await teacherSource(uid, domainId, sourceMessageId);
    const saved = await standards.findOne({ _id: standardId(uid, source), teacherUid: uid, workspaceId: source.pair.workspaceId });
    if (!saved) throw new ClassChatError('NOT_FOUND', '这道题还没有保存标准题解。', 404);
    return publicSolution(saved);
}

let cleanupCursor = '';
let cleaning: Promise<void> = null;
export function cleanupDrafts() {
    if (cleaning) return cleaning;
    cleaning = (async () => {
        // Walk bounded batches, including live drafts, so long-lived sources cannot
        // prevent later orphaned drafts from being checked after a quota prune.
        const batch = await drafts.find(cleanupCursor ? { _id: { $gt: cleanupCursor } } : {})
            .project({ _id: 1, sourceMessageId: 1, teacherUid: 1 }).sort({ _id: 1 }).limit(200).toArray();
        const ids = batch.filter((item) => /^[a-f\d]{24}$/i.test(item.sourceMessageId)).map((item) => new ObjectId(item.sourceMessageId));
        const live = await chat.messages.find({ _id: { $in: ids }, kind: 'snapshot', removed: { $ne: true } })
            .project({ _id: 1, to: 1 }).toArray();
        const sourceTeachers = new Map(live.map((item) => [item._id.toHexString(), item.to]));
        const orphaned = batch.filter((item) => sourceTeachers.get(item.sourceMessageId) !== item.teacherUid);
        if (orphaned.length) await drafts.deleteMany({ _id: { $in: orphaned.map((item) => item._id) } });
        cleanupCursor = batch.length === 200 ? batch.at(-1)._id : '';
    })().finally(() => { cleaning = null; });
    return cleaning;
}

export async function apply(ctx?: Context) {
    await Promise.all([
        drafts.createIndex({ sourceMessageId: 1 }, { name: 'solution_draft_source' }),
        standards.createIndex({ teacherUid: 1, workspaceId: 1, domainId: 1, pid: 1 }, { name: 'solution_standard_owner' }),
    ]);
    if (ctx) ctx.interval(() => cleanupDrafts().catch(() => {}), 60_000);
}
