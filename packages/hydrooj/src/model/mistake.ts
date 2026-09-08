import { Collection, Filter, ObjectId } from 'mongodb';
import db from '../service/db';

export type MistakeStatus = 'review' | 'mastered';
export type MistakeSource = 'manual' | 'after_ac_help' | 'wrong_submit';

export interface MistakeDoc {
    _id: ObjectId;
    domainId: string;
    uid: number;
    pid: number;
    status: MistakeStatus;
    source: MistakeSource;
    importance?: number;
    createdAt: Date;
    updatedAt: Date;
    masteredAt?: Date;
    practiceToken?: string;
    practiceStartedAt?: Date;
    deepenedPracticeToken?: string;
}

export const coll = db.collection('mistake') as unknown as Collection<MistakeDoc>;

function normalize(doc: MistakeDoc | null) {
    return doc ? { ...doc, importance: doc.importance ?? 1 } : null;
}

export async function get(domainId: string, uid: number, pid: number) {
    return normalize(await coll.findOne({ domainId, uid, pid }));
}

export function getMulti(domainId: string, query: Filter<MistakeDoc>) {
    return coll.find({ ...query, domainId });
}

export async function getPage(domainId: string, query: Filter<MistakeDoc>, page: number, pageSize: number) {
    const filter = { ...query, domainId };
    const [count, docs] = await Promise.all([
        coll.countDocuments(filter),
        coll.aggregate<MistakeDoc>([
            { $match: filter },
            // Old entries have the same priority as a newly added importance-1 entry.
            { $set: { importance: { $ifNull: ['$importance', 1] } } },
            { $sort: { importance: -1, updatedAt: -1, _id: -1 } },
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
        ]).toArray(),
    ]);
    return [docs, Math.ceil(count / pageSize), count] as const;
}

export function getPracticeState(doc: MistakeDoc | null, token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{24}$/.test(token) || doc?.practiceToken !== token) return null;
    return {
        token,
        importance: doc.importance ?? 1,
        canDeepen: doc.deepenedPracticeToken !== token,
    };
}

export async function startPractice(domainId: string, uid: number, pid: number) {
    return normalize(await coll.findOneAndUpdate(
        { domainId, uid, pid },
        {
            $set: {
                practiceToken: new ObjectId().toHexString(),
                practiceStartedAt: new Date(),
            },
            $unset: { deepenedPracticeToken: '' },
        },
        { returnDocument: 'after' },
    ));
}

export async function deepen(domainId: string, uid: number, pid: number, practiceToken: string) {
    if (!/^[a-f0-9]{24}$/.test(practiceToken)) return null;
    return normalize(await coll.findOneAndUpdate(
        {
            domainId,
            uid,
            pid,
            practiceToken,
            deepenedPracticeToken: { $ne: practiceToken },
        },
        [{
            $set: {
                importance: { $add: [{ $ifNull: ['$importance', 1] }, 1] },
                deepenedPracticeToken: practiceToken,
                updatedAt: new Date(),
                status: 'review',
            },
        }, { $unset: 'masteredAt' }],
        { returnDocument: 'after' },
    ));
}

export async function add(domainId: string, uid: number, pid: number, source: MistakeSource = 'manual') {
    const now = new Date();
    await coll.updateOne(
        { domainId, uid, pid },
        {
            $set: {
                status: 'review',
                source,
                updatedAt: now,
            },
            $setOnInsert: {
                _id: new ObjectId(),
                domainId,
                uid,
                pid,
                importance: 1,
                createdAt: now,
            },
            $unset: {
                masteredAt: '',
            },
        },
        { upsert: true },
    );
    return get(domainId, uid, pid);
}

export async function master(domainId: string, uid: number, pid: number) {
    const now = new Date();
    await coll.updateOne(
        { domainId, uid, pid },
        {
            $set: {
                status: 'mastered',
                updatedAt: now,
                masteredAt: now,
            },
            $unset: {
                practiceToken: '',
                practiceStartedAt: '',
                deepenedPracticeToken: '',
            },
        },
    );
    return get(domainId, uid, pid);
}
