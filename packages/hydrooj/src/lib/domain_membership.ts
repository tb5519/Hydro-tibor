import { ObjectId } from 'mongodb';
import { ValidationError } from '../error';
import domain from '../model/domain';
import user from '../model/user';
import { sleep } from '../utils';

const MEMBERSHIP_LOCK_FIELD = '_domainMembershipLock';
const MEMBERSHIP_LOCK_LEASE_MS = 120_000;
const MEMBERSHIP_LOCK_WAIT_MS = 5_000;
const LAST_DOMAIN_MESSAGE = '学员至少保留一个域，请先加入其他域后再移除。';
const MEMBERSHIP_BUSY_MESSAGE = '成员关系正在被其他操作修改，请稍后重试。';

interface MembershipLock {
    uid: number;
    owner: string;
}

async function acquireMembershipLock(uid: number, owner: string, validationField: string): Promise<MembershipLock> {
    const deadline = Date.now() + MEMBERSHIP_LOCK_WAIT_MS;
    while (true) {
        const now = new Date();
        // eslint-disable-next-line no-await-in-loop
        const locked = await user.coll.findOneAndUpdate({
            _id: uid,
            $or: [
                { [`${MEMBERSHIP_LOCK_FIELD}.expiresAt`]: { $lte: now } },
                { [MEMBERSHIP_LOCK_FIELD]: { $exists: false } },
            ],
        } as any, {
            $set: {
                [MEMBERSHIP_LOCK_FIELD]: {
                    owner,
                    expiresAt: new Date(now.getTime() + MEMBERSHIP_LOCK_LEASE_MS),
                },
            },
        } as any, { returnDocument: 'after' }) as any;
        if (locked?.[MEMBERSHIP_LOCK_FIELD]?.owner === owner) return { uid, owner };
        if (Date.now() >= deadline) {
            throw new ValidationError(validationField, '', MEMBERSHIP_BUSY_MESSAGE);
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(25);
    }
}

async function releaseMembershipLocks(locks: MembershipLock[]) {
    await Promise.allSettled(locks.map(({ uid, owner }) => user.coll.updateOne({
        _id: uid,
        [`${MEMBERSHIP_LOCK_FIELD}.owner`]: owner,
    } as any, { $unset: { [MEMBERSHIP_LOCK_FIELD]: '' } } as any)));
}

async function renewMembershipLocks(locks: MembershipLock[], validationField: string) {
    if (!locks.length) return;
    const owner = locks[0].owner;
    const result = await user.coll.updateMany({
        _id: { $in: locks.map((lock) => lock.uid) },
        [`${MEMBERSHIP_LOCK_FIELD}.owner`]: owner,
    } as any, { $set: {
        [`${MEMBERSHIP_LOCK_FIELD}.expiresAt`]: new Date(Date.now() + MEMBERSHIP_LOCK_LEASE_MS),
    } } as any);
    if (result.matchedCount !== locks.length) {
        throw new ValidationError(validationField, '', MEMBERSHIP_BUSY_MESSAGE);
    }
}

/**
 * Serialize membership removal per account, then verify every regular account
 * keeps one actually joined domain. The per-user database lease is required:
 * two app workers removing two different domains concurrently must not both
 * validate against the other's soon-to-be-removed membership.
 */
export async function withDomainMembershipRemoval<T>(
    uids: number[], removedDomainIds: string[], callback: () => Promise<T>, validationField = 'uids',
): Promise<T> {
    const guardedUids = Array.from(new Set(uids)).filter((uid) => uid > 1);
    guardedUids.sort((a, b) => a - b);
    const removed = Array.from(new Set(removedDomainIds));
    const owner = new ObjectId().toHexString();
    const locks: MembershipLock[] = [];
    try {
        for (const uid of guardedUids) {
            // A stable acquisition order prevents deadlocks for batch removal.
            // eslint-disable-next-line no-await-in-loop
            locks.push(await acquireMembershipLock(uid, owner, validationField));
        }
        await renewMembershipLocks(locks, validationField);
        const retained = guardedUids.length
            ? await domain.collUser.find({
                uid: { $in: guardedUids },
                join: true,
                domainId: { $nin: removed },
            }).project<{ uid: number, domainId: string }>({ uid: 1, domainId: 1 })
                .sort({ domainId: 1 })
                .toArray()
            : [];
        const retainedDomainIds = Array.from(new Set(retained.map((membership) => membership.domainId)));
        const existingDomains = retainedDomainIds.length
            ? await domain.coll.find({ _id: { $in: retainedDomainIds } })
                .project<{ _id: string }>({ _id: 1 }).toArray()
            : [];
        const existingDomainIds = new Set(existingDomains.map((item) => item._id));
        const fallback = new Map<number, string>();
        for (const membership of retained) {
            if (existingDomainIds.has(membership.domainId) && !fallback.has(membership.uid)) {
                fallback.set(membership.uid, membership.domainId);
            }
        }
        if (guardedUids.some((uid) => !fallback.has(uid))) {
            throw new ValidationError(validationField, '', LAST_DOMAIN_MESSAGE);
        }

        await renewMembershipLocks(locks, validationField);
        let result: T | undefined;
        let callbackError: unknown;
        let callbackFailed = false;
        try {
            result = await callback();
        } catch (error) {
            callbackFailed = true;
            callbackError = error;
        }
        await renewMembershipLocks(locks, validationField);
        if (fallback.size) {
            const accounts = await user.coll.find({
                _id: { $in: [...fallback.keys()] },
                defaultDomain: { $in: removed },
            }).project<{ _id: number }>({ _id: 1 }).toArray();
            await Promise.all(accounts.map((account) => user.setById(
                account._id, { defaultDomain: fallback.get(account._id)! },
            )));
        }
        if (callbackFailed) throw callbackError;
        return result!;
    } finally {
        await releaseMembershipLocks(locks);
    }
}
