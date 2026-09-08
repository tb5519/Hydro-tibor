import { NORMAL_STATUS, STATUS } from '../model/builtin';
import record from '../model/record';

/** Only real judged submissions count, never a scratchpad test run. */
export async function getMistakePromptState(domainId: string, uid: number, pid: number) {
    const query = {
        uid,
        pid,
        status: { $in: NORMAL_STATUS },
        input: { $exists: false },
        contest: { $nin: [record.RECORD_PRETEST, record.RECORD_GENERATE] },
    };
    const [first, latest] = await Promise.all([
        record.getMulti(domainId, query).project({ _id: 1, status: 1 }).sort({ _id: 1 }).limit(1).next(),
        record.getMulti(domainId, query).project({ _id: 1, status: 1 }).sort({ _id: -1 }).limit(1).next(),
    ]);
    return {
        eligible: !!first && first.status !== STATUS.STATUS_ACCEPTED
            && latest?.status === STATUS.STATUS_ACCEPTED
            && first._id.toString() !== latest._id.toString(),
        latestRid: latest?._id?.toString() || '',
        latestSubmitAt: latest?._id?.getTimestamp().getTime() || 0,
    };
}
