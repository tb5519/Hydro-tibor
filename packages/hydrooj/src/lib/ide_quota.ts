import { randomBytes } from 'crypto';
import db from '../service/db';
import { IdeError, IDE_LIMITS } from './ide_protocol';

interface IdeLease { _id: string; owner: string; expiresAt: Date; revision?: number }
interface IdeControl { _id: string; revision: number; resetting: boolean; requestedBy?: number; requestedAt?: Date; completedAt?: Date }
declare module '../service/db' { interface Collections { 'ide.lease': IdeLease; 'ide.control': IdeControl } }
export const leases = db.collection('ide.lease');
export const controls = db.collection('ide.control');
export const ideConcurrency = (configured: unknown) => {
    const value = Number(configured);
    return Number.isInteger(value) && value >= 1 && value <= 16 ? value : 4;
};
export async function getIdeControl() {
    const control = await controls.findOne({ _id: 'pool' });
    if (!control) return { _id: 'pool', revision: 0, resetting: false };
    if (!Number.isSafeInteger(control.revision) || control.revision < 0 || typeof control.resetting !== 'boolean') {
        throw new IdeError('UNAVAILABLE', '运行服务状态异常，请联系老师。');
    }
    return control;
}

/** Never erase the revision: a delayed acquire from before a reset must fail its final gate check. */
export async function requestIdeReset(uid: number, now = Date.now()) {
    try {
        return await controls.findOneAndUpdate({ _id: 'pool', resetting: { $ne: true } },
            { $inc: { revision: 1 }, $set: { resetting: true, requestedBy: uid, requestedAt: new Date(now) } },
            { upsert: true, returnDocument: 'after' });
    } catch (error) {
        // A repeated request joins the existing reset rather than starting a second reset.
        if (error.code !== 11000) throw error;
        return getIdeControl();
    }
}

export async function finishIdeReset(now = Date.now()) {
    const control = await getIdeControl();
    if (!control.resetting) return control;
    // Include partial claims conservatively. Unknown, unconfirmed processes keep
    // their hard lease; deleting it here could admit more processes than the cap.
    if (await leases.countDocuments({ expiresAt: { $gt: new Date(now) } }, { limit: 1 })) return control;
    await controls.updateOne({ _id: 'pool', revision: control.revision, resetting: true },
        { $set: { resetting: false, completedAt: new Date(now) } });
    return getIdeControl();
}

export async function getIdeCapacity(uid: number, capacity: number, now = Date.now()) {
    await finishIdeReset(now);
    const live = await leases.find({ _id: { $in: [...Array.from({ length: 16 }, (_, i) => `slot:${i}`), 'compiler', `user:${uid}`] },
        expiresAt: { $gt: new Date(now) } }, { projection: { _id: 1 } }).toArray();
    const control = await getIdeControl();
    const used = new Set(live.filter((lease) => lease._id.startsWith('slot:')).map((lease) => lease._id)).size;
    return { capacity, used, available: control.resetting ? 0 : Math.max(0, capacity - used),
        compilerBusy: live.some((lease) => lease._id === 'compiler'), ownRunning: live.some((lease) => lease._id === `user:${uid}`),
        resetting: control.resetting };
}

/** Fixed, hard-expiry leases survive worker crashes. They must outlive the sandbox wall limit. */
export async function acquireIdeLease(uid: number, concurrency: number, now = Date.now(), compile = false) {
    const control = await getIdeControl();
    if (control.resetting) throw new IdeError('RESETTING', '老师正在停止在线 IDE 程序，请稍候再运行。');
    const owner = randomBytes(24).toString('hex');
    const expiresAt = new Date(now + (IDE_LIMITS.wallSeconds + 90) * 1000);
    const claim = async (_id: string) => {
        try {
            return !!await leases.findOneAndUpdate({ _id, expiresAt: { $lte: new Date(now) } },
                { $set: { owner, expiresAt, revision: control.revision } }, { upsert: true, returnDocument: 'after' });
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
        const latest = await getIdeControl();
        if (latest.resetting || latest.revision !== control.revision) throw new IdeError('RESETTING', '老师正在停止在线 IDE 程序，请稍候再运行。');
    } catch (error) {
        await leases.deleteMany({ owner });
        throw error;
    }
    return { owner, expiresAt, revision: control.revision, release: () => leases.deleteMany({ owner }),
        releaseCompilation: () => leases.deleteOne({ _id: 'compiler', owner }) };
}
