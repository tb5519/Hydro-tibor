/* eslint-disable no-cond-assign */
/* eslint-disable no-await-in-loop */
import { NumericDictionary } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import Schema from 'schemastery';
import { Counter } from '@hydrooj/utils';
import { Udoc } from '../interface';
import difficultyAlgorithm from '../lib/difficulty';
import { getOjDomainQuery, isScratchDomain } from '../lib/domain_type';
import { invalidateSharedRankingSnapshot } from '../lib/shared_ranking';
import {
    applyIncrementalRanking, freezeProblemRpForRebuild, publishRankingUpdate, withRankingRebuild,
} from '../lib/incremental_ranking';
import { PRIV, STATUS } from '../model/builtin';
import domain from '../model/domain';
import UserModel from '../model/user';
import db from '../service/db';

export const description = 'Calculate RP for a domain';

type ND = NumericDictionary<number>;
type Report = (data: any) => void;

interface RpDef {
    run(domainIds: string[], udict: ND, report: Report, frozen?: FrozenProblemRpSnapshot, scope?: 'local' | 'shared'): Promise<void>;
    hidden: boolean;
    base: number;
}

interface FrozenProblemRpSnapshot {
    local: Map<string, Map<number, number>>;
    shared: Map<number, number>;
}

const AUTO_DIFFICULTY_PRIOR_SUBMIT = 30;
const AUTO_DIFFICULTY_PRIOR_ACCEPT_RATE = 0.45;

export function getProblemRpDifficulty(pdoc: { difficulty?: number, nSubmit?: number, nAccept?: number }) {
    const fixedDifficulty = +pdoc.difficulty;
    if (fixedDifficulty > 0) return fixedDifficulty;
    const nSubmit = Math.max(0, Math.floor(+pdoc.nSubmit || 0));
    const nAccept = Math.max(0, Math.floor(+pdoc.nAccept || 0));
    const smoothedSubmit = nSubmit + AUTO_DIFFICULTY_PRIOR_SUBMIT;
    const smoothedAccept = nAccept + AUTO_DIFFICULTY_PRIOR_SUBMIT * AUTO_DIFFICULTY_PRIOR_ACCEPT_RATE;
    return difficultyAlgorithm(smoothedSubmit, smoothedAccept) || 5;
}

export const RpTypes: Record<string, RpDef> = {
    problem: {
        async run(domainIds, udict, report, frozen, scope) {
            const snapshot = frozen || await freezeProblemRpForRebuild(domainIds);
            const shared = scope === 'shared' || (!scope && domainIds.length > 1);
            const values = shared ? snapshot.shared : snapshot.local.get(domainIds[0]);
            for (const [uid, value] of values || []) udict[uid] = value;
            await report({ message: `Restored frozen problem RP for ${values?.size || 0} users` });
        },
        hidden: false,
        base: 0,
    },
    delta: {
        async run(domainIds, udict) {
            const dudocs = await domain.getMultiUserInDomain(
                '', { domainId: { $in: domainIds }, rpdelta: { $exists: true } },
            ).toArray();
            for (const dudoc of dudocs) udict[dudoc.uid] = (udict[dudoc.uid] || 0) + dudoc.rpdelta;
        },
        hidden: true,
        base: 0,
    },
};
global.Hydro.model.rp = RpTypes;

export async function calcLevel(domainId: string, report: Report) {
    await domain.setMultiUserInDomain(domainId, {}, { level: 0, rank: null });
    let last = { rp: null };
    let rank = 0;
    let count = 0;
    const coll = db.collection('domain.user');
    const filter = { rp: { $gt: 0 }, uid: { $nin: [0, 1], $gt: -1000 } };
    const ducur = domain.getMultiUserInDomain(domainId, filter)
        .project<{ _id: ObjectId, rp: number }>({ rp: 1 })
        .sort({ rp: -1 });
    let bulk = coll.initializeUnorderedBulkOp();
    for await (const dudoc of ducur) {
        count++;
        dudoc.rp ||= null;
        if (dudoc.rp !== last.rp) rank = count;
        bulk.find({ _id: dudoc._id }).updateOne({ $set: { rank } });
        last = dudoc;
        if (count % 100 === 0) report({ message: `#${count}: Rank ${rank}` });
    }
    if (!count) return;
    await bulk.execute();
    const levels = global.Hydro.model.builtin.LEVELS;
    bulk = coll.initializeUnorderedBulkOp();
    for (let i = 0; i < levels.length; i++) {
        const query: Filter<Udoc> = {
            domainId,
            $and: [{ rank: { $lte: (levels[i] * count) / 100 } }],
        };
        if (i < levels.length - 1) query.$and.push({ rank: { $gt: (levels[i + 1] * count) / 100 } });
        bulk.find(query).update({ $set: { level: i } });
    }
    await bulk.execute();
}

async function runInDomain(domainId: string, report: Report, frozen: FrozenProblemRpSnapshot) {
    if (isScratchDomain(await domain.get(domainId))) return;
    const results: Record<keyof typeof RpTypes, ND> = {};
    const udict = Counter();
    await db.collection('domain.user').updateMany({ domainId }, { $set: { rpInfo: {} } });
    for (const type in RpTypes) {
        results[type] = new Proxy({}, { get: (self, key) => self[key] || RpTypes[type].base });
        await RpTypes[type].run([domainId], results[type], report, frozen, 'local');
        const bulk = db.collection('domain.user').initializeUnorderedBulkOp();
        for (const uid in results[type]) {
            const udoc = await UserModel.getById(domainId, +uid);
            if (!udoc?.hasPriv(PRIV.PRIV_USER_PROFILE)) continue;
            bulk.find({ domainId, uid: +uid }).updateOne({ $set: { [`rpInfo.${type}`]: results[type][uid] } });
            udict[+uid] += results[type][uid];
        }
        if (bulk.batches.length) await bulk.execute();
    }
    await domain.setMultiUserInDomain(domainId, {}, { rp: 0 });
    const bulk = db.collection('domain.user').initializeUnorderedBulkOp();
    for (const uid in udict) {
        bulk.find({ domainId, uid: +uid }).upsert().update({ $set: { rp: Math.max(0, udict[uid]) } });
    }
    if (bulk.batches.length) await bulk.execute();
    await calcLevel(domainId, report);
}

// Shared problem RP has its own frozen baseline and awards. Never sum local
// values or recompute historical awards from today's problem difficulty.
async function runAcrossDomains(domainIds: string[], report: Report, frozen: FrozenProblemRpSnapshot) {
    const membershipDocs = await domain.collUser.find({
        domainId: { $in: domainIds },
        join: true,
        uid: { $gt: 1 },
    }).project<{ domainId: string, uid: number }>({ domainId: 1, uid: 1 }).toArray();
    const membership = new Map<number, string[]>();
    for (const dudoc of membershipDocs) {
        const udoc = await UserModel.getById(dudoc.domainId, dudoc.uid);
        if (!udoc?.hasPriv(PRIV.PRIV_USER_PROFILE)) continue;
        membership.set(dudoc.uid, (membership.get(dudoc.uid) || []).concat(dudoc.domainId));
    }

    const coll = db.collection('domain.user');
    await coll.updateMany({ domainId: { $in: domainIds } }, {
        $set: { sharedRpInfo: {}, sharedRp: 0 },
    });
    const total = Counter();
    for (const type in RpTypes) {
        const result: ND = new Proxy({}, { get: (self, key) => self[key] || RpTypes[type].base });
        await RpTypes[type].run(domainIds, result, report, frozen, 'shared');
        const bulk = coll.initializeUnorderedBulkOp();
        for (const uidText in result) {
            const uid = +uidText;
            const domains = membership.get(uid);
            if (!domains?.length) continue;
            const value = result[uidText];
            total[uid] += value;
            bulk.find({ domainId: { $in: domains }, uid, join: true })
                .update({ $set: { [`sharedRpInfo.${type}`]: value } });
        }
        if (bulk.batches.length) await bulk.execute();
    }

    const bulk = coll.initializeUnorderedBulkOp();
    for (const uidText in total) {
        const uid = +uidText;
        const domains = membership.get(uid);
        if (!domains?.length) continue;
        bulk.find({ domainId: { $in: domains }, uid, join: true })
            .update({ $set: { sharedRp: Math.max(0, total[uid]) } });
    }
    if (bulk.batches.length) await bulk.execute();
}

async function runUnlocked({ domainId }, report: Report) {
    const allDomains = await domain.getMulti(getOjDomainQuery()).project<{ _id: string, rankingMode?: string }>({ _id: 1, rankingMode: 1 }).toArray();
    const allDomainIds = allDomains.map((ddoc) => ddoc._id);
    // Take the immutable ledger snapshot before clearing any displayed RP.
    // First-time migration must retain the RP already earned, even when a
    // teacher changed difficulty before this maintenance command was run.
    const frozen = await freezeProblemRpForRebuild(allDomainIds);
    if (!domainId) {
        const domains = allDomains;
        await report({ message: `Found ${domains.length} domains` });
        for (const i in domains) {
            const start = Date.now();
            await runInDomain(domains[i]._id, report, frozen);
            await report({
                case: {
                    status: STATUS.STATUS_ACCEPTED,
                    message: `Domain ${domains[i]._id} finished`,
                    time: Date.now() - start,
                    memory: 0,
                    score: 0,
                },
                progress: Math.floor(((+i + 1) / domains.length) * 100),
            });
        }
    } else await runInDomain(domainId, report, frozen);

    if (allDomains.some((ddoc) => ddoc.rankingMode === 'all')) {
        const start = Date.now();
        const domainIds = allDomains.map((ddoc) => ddoc._id);
        await report({ message: `Calculating shared RP across ${domainIds.length} domains` });
        await runAcrossDomains(domainIds, report, frozen);
        await report({
            case: {
                status: STATUS.STATUS_ACCEPTED,
                message: 'Shared ranking finished',
                time: Date.now() - start,
                memory: 0,
                score: 0,
            },
            progress: 100,
        });
    }
    invalidateSharedRankingSnapshot();
    return true;
}

export async function run(args: { domainId?: string }, report: Report) {
    return withRankingRebuild(async () => {
        const result = await runUnlocked({ domainId: args.domainId }, report);
        const domainIds = (await domain.getMulti(getOjDomainQuery()).project<{ _id: string }>({ _id: 1 }).toArray()).map((item) => item._id);
        await publishRankingUpdate(domainIds);
        return result;
    });
}

export async function apply(ctx) {
    await applyIncrementalRanking(ctx);
    ctx.addScript(
        'rp', 'Calculate RP for a domain and refresh shared rankings when enabled.',
        Schema.object({ domainId: Schema.string() }), run,
    );
}
