/* eslint-disable no-await-in-loop -- Existing challenges receive stable numbers in creation order. */
import { ObjectId } from 'mongodb';
import type { Context } from '../context';
import { NotFoundError, PermissionError, ValidationError } from '../error';
import db from '../service/db';
import type { ScratchActor } from './scratch';

export type ScratchProblemKind = 'project' | 'objective';
interface ScratchProblemCode {
    _id: string; domainId: string; kind: ScratchProblemKind; sourceId: string;
    code: string; claimedCodes: string[]; revision: string; updatedAt: Date;
    pendingCode?: string; reservedUntil?: Date;
}
interface ScratchProblemCounter { _id: string; next: number }
export interface ScratchProblemCodeReservation { code: string; commit(): Promise<void>; rollback(): Promise<void> }
declare module '../service/db' {
    interface Collections {
        'scratch.problem.code': ScratchProblemCode;
        'scratch.problem.counter': ScratchProblemCounter;
    }
}
export const codes = db.collection('scratch.problem.code');
export const counters = db.collection('scratch.problem.counter');
const assignments = db.collection('scratch.assignment');
const documents = db.collection('document');
let indexes: Promise<unknown> | undefined;
const migrations = new Map<string, Promise<Map<string, string>>>();
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function normalizeProblemCode(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if ((typeof value !== 'string' && typeof value !== 'number')
        || (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 1))) throw new ValidationError('problemCode', null, '题目ID格式不正确。');
    const code = String(value).trim().toUpperCase();
    if (!code) return undefined;
    if (code.length > 32 || !/^(?:[1-9][0-9]*|[A-Z][A-Z0-9_-]*)$/.test(code)) {
        throw new ValidationError('problemCode', null, '题目ID请填写正整数，或以字母开头的字母、数字、短横线、下划线，最多32个字符。');
    }
    return code;
}

export function compareProblemCodes(a: { problemCode: string; kind?: string; id?: unknown }, b: { problemCode: string; kind?: string; id?: unknown }) {
    return natural.compare(a.problemCode, b.problemCode) || a.problemCode.localeCompare(b.problemCode)
        || `${a.kind || ''}:${a.id || ''}`.localeCompare(`${b.kind || ''}:${b.id || ''}`);
}

export function problemCodeKey(kind: ScratchProblemKind, sourceId: ObjectId | string | number) {
    const value = String(sourceId);
    if (kind === 'project' ? !/^[a-f0-9]{24}$/i.test(value) : kind !== 'objective' || !/^[1-9][0-9]*$/.test(value)
        || !Number.isSafeInteger(Number(value))) throw new ValidationError('problemId');
    return `${kind}:${kind === 'project' ? value.toLowerCase() : value}`;
}
const identity = (domainId: string, kind: ScratchProblemKind, sourceId: ObjectId | string | number) => `${encodeURIComponent(domainId)}:${problemCodeKey(kind, sourceId)}`;

async function ensureIndexes() {
    indexes ||= (async () => {
        await codes.createIndex({ domainId: 1, code: 1 }, { name: 'scratch_problem_code_unique', unique: true });
        const legacy = await codes.find({ claimedCodes: { $exists: false } }).toArray();
        for (const doc of legacy) {
            await codes.updateOne({ _id: doc._id, revision: doc.revision, claimedCodes: { $exists: false } },
                { $set: { claimedCodes: [doc.code] } });
        }
        await codes.createIndex({ domainId: 1, claimedCodes: 1 }, {
            name: 'scratch_problem_code_claims_unique', unique: true, partialFilterExpression: { claimedCodes: { $exists: true } },
        });
    })().catch((error) => { indexes = undefined; throw error; });
    await indexes;
}

async function sourceExists(domainId: string, kind: ScratchProblemKind, sourceId: string, visible = false) {
    problemCodeKey(kind, sourceId);
    if (kind === 'project') {
        return assignments.findOne({ domainId, _id: new ObjectId(sourceId), kind: 'problem',
            problemPaperId: { $exists: false }, ...(visible ? { hidden: { $ne: true } } : {}) }, { projection: { _id: 1 } });
    }
    return documents.findOne({ domainId, docType: 10, docId: Number(sourceId),
        'objectivePaper.items.0': { $exists: true }, objectiveKind: { $exists: false }, reference: { $exists: false },
        ...(visible ? { hidden: false } : {}) }, { projection: { _id: 1 } });
}

async function availableCode(domainId: string, code: string, ownId: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const occupied = await codes.findOne({ domainId, $or: [{ code }, { claimedCodes: code }] });
        if (!occupied || occupied._id === ownId) return;
        const now = new Date();
        const expired = !occupied.reservedUntil || +occupied.reservedUntil <= +now;
        if (expired && occupied.pendingCode === code && occupied.code !== code) {
            // Reclaim interrupted renames while preserving the committed ID.
            // A new revision fences a delayed commit from the previous owner.
            await codes.updateOne({ _id: occupied._id, revision: occupied.revision, pendingCode: code,
                $or: [{ reservedUntil: { $exists: false } }, { reservedUntil: { $lte: now } }] }, {
                $set: { claimedCodes: [occupied.code], revision: new ObjectId().toHexString(), updatedAt: now },
                $unset: { pendingCode: '', reservedUntil: '' },
            });
            continue;
        }
        if (expired && !await sourceExists(domainId, occupied.kind, occupied.sourceId)) {
            await codes.deleteOne({ _id: occupied._id, revision: occupied.revision });
            continue;
        }
        throw new ValidationError('problemCode', null, '题目ID已被使用，请换一个ID。');
    }
    throw new ValidationError('problemCode', null, '题目ID正在更新，请稍后重试。');
}

async function automaticCode(domainId: string, kind: ScratchProblemKind, sourceId: string, reserving = false) {
    const _id = identity(domainId, kind, sourceId);
    const existing = await codes.findOne({ _id });
    if (existing) return { ...existing, allocated: false };
    for (let attempt = 0; attempt < 100; attempt++) {
        let counter: ScratchProblemCounter | null;
        try {
            counter = await counters.findOneAndUpdate({ _id: domainId }, { $inc: { next: 1 } }, { upsert: true, returnDocument: 'after' });
        } catch (error) {
            if (error.code !== 11000) throw error;
            counter = await counters.findOneAndUpdate({ _id: domainId }, { $inc: { next: 1 } }, { returnDocument: 'after' });
        }
        if (!counter || !Number.isSafeInteger(counter.next) || counter.next < 1) throw new ValidationError('problemCode', null, '题目ID分配暂时不可用，请重试。');
        const code = `S${counter.next}`;
        const doc: ScratchProblemCode = { _id, domainId, kind, sourceId, code, claimedCodes: [code],
            revision: new ObjectId().toHexString(), updatedAt: new Date(),
            ...(reserving ? { pendingCode: code, reservedUntil: new Date(Date.now() + 10 * 60000) } : {}) };
        try { await codes.insertOne(doc); return { ...doc, allocated: true }; } catch (error) {
            if (error.code !== 11000) throw error;
            const winner = await codes.findOne({ _id });
            if (winner) return { ...winner, allocated: false };
        }
    }
    throw new ValidationError('problemCode', null, '题目ID分配繁忙，请重试。');
}

/** Metadata only: source routes, works and submissions keep their identities. */
export async function ensureDomainProblemCodes(domainId: string): Promise<Map<string, string>> {
    const inFlight = migrations.get(domainId);
    if (inFlight) return inFlight;
    const migration = (async () => {
        await ensureIndexes();
        const [projects, papers, known] = await Promise.all([
            assignments.find({ domainId, kind: 'problem', problemPaperId: { $exists: false } })
                .project({ _id: 1, createdAt: 1 }).toArray(),
            documents.find({ domainId, docType: 10, 'objectivePaper.items.0': { $exists: true },
                objectiveKind: { $exists: false }, reference: { $exists: false } }).project({ _id: 1, docId: 1 }).toArray(),
            codes.find({ domainId }).toArray(),
        ]);
        const stamp = (doc: { _id: unknown; createdAt?: Date }) => doc.createdAt instanceof Date ? +doc.createdAt
            : doc._id instanceof ObjectId ? +doc._id.getTimestamp() : 0;
        const sources = [...projects.map((doc) => ({ kind: 'project' as const, sourceId: String(doc._id), at: stamp(doc) })),
            ...papers.map((doc) => ({ kind: 'objective' as const, sourceId: String(doc.docId), at: stamp(doc) }))]
            .sort((a, b) => a.at - b.at || natural.compare(problemCodeKey(a.kind, a.sourceId), problemCodeKey(b.kind, b.sourceId)));
        const output = new Map(known.map((doc) => [problemCodeKey(doc.kind, doc.sourceId), doc.code]));
        for (const source of sources) {
            const key = problemCodeKey(source.kind, source.sourceId);
            if (!output.has(key)) output.set(key, (await automaticCode(domainId, source.kind, source.sourceId)).code);
        }
        return output;
    })();
    migrations.set(domainId, migration);
    try { return await migration; } finally { if (migrations.get(domainId) === migration) migrations.delete(domainId); }
}

export async function getProblemCode(actor: ScratchActor, kind: ScratchProblemKind, sourceId: ObjectId | string | number) {
    const key = problemCodeKey(kind, sourceId);
    if (!await sourceExists(actor.domainId, kind, String(sourceId), !actor.isTeacher)) throw new NotFoundError('Scratch 题目');
    const mapping = await ensureDomainProblemCodes(actor.domainId);
    return mapping.get(key)!;
}

/** Internal reservations may precede insertion only for server-generated IDs. */
export async function reserveProblemCode(actor: ScratchActor, kind: ScratchProblemKind, sourceId: ObjectId | string | number,
    input: unknown): Promise<ScratchProblemCodeReservation> {
    if (!actor.isTeacher) throw new PermissionError('Scratch 教学管理');
    const key = problemCodeKey(kind, sourceId); let normalized = normalizeProblemCode(input);
    await ensureIndexes();
    const _id = identity(actor.domainId, kind, sourceId);
    const original = await codes.findOne({ _id });
    const busy = () => new ValidationError('problemCode', null, '这道题正在保存，请稍后再试。');
    if (original?.reservedUntil && +original.reservedUntil > Date.now()) throw busy();
    let revision: string;
    if (!normalized && !original) {
        const allocated = await automaticCode(actor.domainId, kind, String(sourceId), true);
        if (!allocated.allocated) return reserveProblemCode(actor, kind, sourceId, input);
        normalized = allocated.code;
        revision = allocated.revision;
    } else {
        normalized ||= original!.code;
        await availableCode(actor.domainId, normalized, _id);
        revision = new ObjectId().toHexString();
        const now = new Date();
        const pending = { revision, pendingCode: normalized, reservedUntil: new Date(+now + 10 * 60000), updatedAt: now,
            claimedCodes: [...new Set([...(original ? [original.code] : []), normalized])] };
        try {
            if (original) {
                const result = await codes.updateOne({ _id, revision: original.revision,
                    $or: [{ reservedUntil: { $exists: false } }, { reservedUntil: { $lte: now } }] }, { $set: pending });
                if (!result.matchedCount) throw busy();
            } else {
                await codes.insertOne({ _id, domainId: actor.domainId, kind, sourceId: key.slice(kind.length + 1), code: normalized, ...pending });
            }
        } catch (error) {
            if (error.code === 11000) {
                if (!original && await codes.findOne({ _id })) throw busy();
                throw new ValidationError('problemCode', null, '题目ID已被使用，请换一个ID。');
            }
            throw error;
        }
    }
    let settled = false;
    const code = normalized;
    return { code, async commit() {
        if (settled) return;
        const result = await codes.updateOne({ _id, revision, pendingCode: code }, {
            $set: { code, claimedCodes: [code], updatedAt: new Date() }, $unset: { pendingCode: '', reservedUntil: '' },
        });
        if (!result.matchedCount) throw busy();
        settled = true;
    }, async rollback() {
        if (settled) return;
        if (original) {
            await codes.updateOne({ _id, revision, pendingCode: code }, {
                $set: { claimedCodes: [original.code], revision: new ObjectId().toHexString(), updatedAt: new Date() },
                $unset: { pendingCode: '', reservedUntil: '' },
            });
        } else await codes.deleteOne({ _id, revision, pendingCode: code });
        settled = true;
    } };
}

export async function setProblemCode(actor: ScratchActor, kind: ScratchProblemKind, sourceId: ObjectId | string | number, input: unknown) {
    if (!actor.isTeacher) throw new PermissionError('Scratch 教学管理');
    problemCodeKey(kind, sourceId);
    if (!await sourceExists(actor.domainId, kind, String(sourceId))) throw new NotFoundError('Scratch 题目');
    await ensureDomainProblemCodes(actor.domainId);
    const reservation = await reserveProblemCode(actor, kind, sourceId, input);
    try { await reservation.commit(); } catch (error) { await reservation.rollback(); throw error; }
    return reservation.code;
}

export async function apply(ctx: Context) {
    await ensureIndexes();
    ctx.on('domain/delete', async (domainId) => { await Promise.all([codes.deleteMany({ domainId }), counters.deleteOne({ _id: domainId })]); });
}
