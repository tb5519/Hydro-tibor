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
    createdAt: Date;
    updatedAt: Date;
    masteredAt?: Date;
}

export const coll = db.collection('mistake') as unknown as Collection<MistakeDoc>;

export function get(domainId: string, uid: number, pid: number) {
    return coll.findOne({ domainId, uid, pid });
}

export function getMulti(domainId: string, query: Filter<MistakeDoc>) {
    return coll.find({ domainId, ...query });
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
        },
    );
    return get(domainId, uid, pid);
}
