import { randomBytes } from 'crypto';
import db from '../service/db';
import { IdeError, IDE_LIMITS } from './ide_protocol';

interface IdeLease { _id: string; owner: string; expiresAt: Date }
declare module '../service/db' { interface Collections { 'ide.lease': IdeLease } }
export const leases = db.collection('ide.lease');

/** Fixed, hard-expiry leases survive worker crashes. They must outlive the sandbox wall limit. */
export async function acquireIdeLease(uid: number, concurrency: number, now = Date.now(), compile = false) {
    const owner = randomBytes(24).toString('hex');
    const expiresAt = new Date(now + (IDE_LIMITS.wallSeconds + 90) * 1000);
    const claim = async (_id: string) => {
        try {
            return !!await leases.findOneAndUpdate({ _id, expiresAt: { $lte: new Date(now) } },
                { $set: { owner, expiresAt } }, { upsert: true, returnDocument: 'after' });
        } catch (error) { if (error.code === 11000) return false; throw error; }
    };
    if (!await claim(`user:${uid}`)) throw new IdeError('ALREADY_RUNNING', '你已有程序正在运行，请先停止另一个页面中的程序。');
    let slot: string;
    try {
        for (let index = 0; index < concurrency; index++) {
            // eslint-disable-next-line no-await-in-loop
            if (await claim(`slot:${index}`)) { slot = `slot:${index}`; break; }
        }
        if (!slot) throw new IdeError('BUSY', '运行位置暂时已满，请稍等片刻再试。');
        if (compile && !await claim('compiler')) throw new IdeError('BUSY', '正在准备其他同学的程序，请稍等几秒再运行。');
    } catch (error) {
        await leases.deleteMany({ owner });
        throw error;
    }
    return { owner, expiresAt, release: () => leases.deleteMany({ owner }),
        releaseCompilation: () => leases.deleteOne({ _id: 'compiler', owner }) };
}
