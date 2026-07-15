/* eslint-disable no-cond-assign */
/* eslint-disable no-await-in-loop */
import { NumericDictionary } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import Schema from 'schemastery';
import { Counter } from '@hydrooj/utils';
import { Tdoc, Udoc } from '../interface';
import difficultyAlgorithm from '../lib/difficulty';
import rating from '../lib/rating';
import { invalidateSharedRankingSnapshot } from '../lib/shared_ranking';
import { PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import domain from '../model/domain';
import problem from '../model/problem';
import system from '../model/system';
import UserModel from '../model/user';
import db from '../service/db';

export const description = 'Calculate RP for a domain, or a shared ranking across all domains';

type ND = NumericDictionary<number>;
type Report = (data: any) => void;

interface RpDef {
    run(domainIds: string[], udict: ND, report: Report): Promise<void>;
    hidden: boolean;
    base: number;
}

const { log, max, min } = Math;
const AUTO_DIFFICULTY_PRIOR_SUBMIT = 30;
const AUTO_DIFFICULTY_PRIOR_ACCEPT_RATE = 0.45;
const PROBLEM_RP_SOLVED_LOG_WEIGHT = 52;

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
        async run(domainIds, udict, report) {
            const problems = await problem.getMulti('', { domainId: { $in: domainIds }, nAccept: { $gt: 0 } }).toArray();
            if (problems.length) await report({ message: `Found ${problems.length} problems in ${domainIds[0]}` });
            const solved = Counter();
            for (const pdoc of problems) {
                const cursor = problem.getMultiStatus(
                    pdoc.domainId,
                    {
                        docId: pdoc.docId,
                        rid: { $ne: null },
                        uid: { $ne: pdoc.owner },
                        score: { $gt: 0 },
                    },
                );
                let psdoc;
                while (psdoc = await cursor.next()) {
                    const scoreRatio = min(psdoc.score, 100) / 100;
                    solved[psdoc.uid] += scoreRatio;
                }
            }
            for (const key in solved) {
                const solvedRp = log(solved[key] + 1) * PROBLEM_RP_SOLVED_LOG_WEIGHT;
                udict[key] = max(0, solvedRp);
            }
        },
        hidden: false,
        base: 0,
    },
    contest: {
        async run(domainIds, udict, report) {
            const contests: Tdoc[] = await contest.getMulti('', { domainId: { $in: domainIds }, rated: true })
                .limit(10).toArray() as any;
            if (contests.length) await report({ message: `Found ${contests.length} contests in ${domainIds[0]}` });
            for (const tdoc of contests.reverse()) {
                const start = Date.now();
                const query = {
                    docId: tdoc.docId,
                    journal: { $ne: null },
                };
                if (!await contest.countStatus(tdoc.domainId, query)) continue;
                const cursor = contest.getMultiStatus(tdoc.domainId, query).sort(contest.RULES[tdoc.rule].statusSort);
                const rankedTsdocs = await contest.RULES[tdoc.rule].ranked(tdoc, cursor);
                const users = rankedTsdocs.map((i) => ({ uid: i[1].uid, rank: i[0], old: udict[i[1].uid] }));
                // FIXME sum(rating.new) always less than sum(rating.old)
                for (const udoc of rating(users)) udict[udoc.uid] = udoc.new;
                await report({
                    case: {
                        status: STATUS.STATUS_ACCEPTED,
                        message: `Contest ${tdoc.title} finished`,
                        time: Date.now() - start,
                        memory: 0,
                        score: 0,
                    },
                });
            }
            for (const key in udict) udict[key] = max(1, udict[key] / 4 - 375);
        },
        hidden: false,
        base: 1500,
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

async function runInDomain(domainId: string, report: Report) {
    const results: Record<keyof typeof RpTypes, ND> = {};
    const udict = Counter();
    await db.collection('domain.user').updateMany({ domainId }, { $set: { rpInfo: {} } });
    for (const type in RpTypes) {
        results[type] = new Proxy({}, { get: (self, key) => self[key] || RpTypes[type].base });
        await RpTypes[type].run([domainId], results[type], report);
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

async function calcSharedLevel(domainIds: string[], report: Report) {
    const coll = db.collection('domain.user');
    await coll.updateMany({ domainId: { $in: domainIds } }, { $set: { level: 0, rank: null } });
    const users = await coll.aggregate<{ _id: number, rp: number }>([
        {
            $match: {
                domainId: { $in: domainIds },
                join: true,
                rp: { $gt: 0 },
                uid: { $nin: [0, 1], $gt: -1000 },
            },
        },
        { $group: { _id: '$uid', rp: { $max: '$rp' } } },
        { $sort: { rp: -1, _id: 1 } },
    ]).toArray();
    if (!users.length) return;

    let lastRp: number | null = null;
    let rank = 0;
    let bulk = coll.initializeUnorderedBulkOp();
    for (let index = 0; index < users.length; index++) {
        const entry = users[index];
        if (entry.rp !== lastRp) rank = index + 1;
        bulk.find({ domainId: { $in: domainIds }, uid: entry._id, join: true }).update({ $set: { rank } });
        lastRp = entry.rp;
        if ((index + 1) % 100 === 0) report({ message: `#${index + 1}: Shared rank ${rank}` });
    }
    if (bulk.batches.length) await bulk.execute();

    const levels = global.Hydro.model.builtin.LEVELS;
    bulk = coll.initializeUnorderedBulkOp();
    for (let i = 0; i < levels.length; i++) {
        const range: any = { rank: { $lte: (levels[i] * users.length) / 100 } };
        if (i < levels.length - 1) range.rank.$gt = (levels[i + 1] * users.length) / 100;
        bulk.find({ domainId: { $in: domainIds }, join: true, ...range }).update({ $set: { level: i } });
    }
    if (bulk.batches.length) await bulk.execute();
}

async function runAcrossDomains(domainIds: string[], report: Report) {
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
        $set: { rpInfo: {}, rp: 0, level: 0, rank: null },
    });
    const total = Counter();
    for (const type in RpTypes) {
        const result: ND = new Proxy({}, { get: (self, key) => self[key] || RpTypes[type].base });
        await RpTypes[type].run(domainIds, result, report);
        const bulk = coll.initializeUnorderedBulkOp();
        for (const uidText in result) {
            const uid = +uidText;
            const domains = membership.get(uid);
            if (!domains?.length) continue;
            const value = result[uidText];
            total[uid] += value;
            bulk.find({ domainId: { $in: domains }, uid, join: true })
                .update({ $set: { [`rpInfo.${type}`]: value } });
        }
        if (bulk.batches.length) await bulk.execute();
    }

    const bulk = coll.initializeUnorderedBulkOp();
    for (const uidText in total) {
        const uid = +uidText;
        const domains = membership.get(uid);
        if (!domains?.length) continue;
        bulk.find({ domainId: { $in: domains }, uid, join: true })
            .update({ $set: { rp: Math.max(0, total[uid]) } });
    }
    if (bulk.batches.length) await bulk.execute();
    await calcSharedLevel(domainIds, report);
}

export async function run({ domainId }, report: Report) {
    if (system.get('ranking.mode') === 'all') {
        const domains = await domain.getMulti().project<{ _id: string }>({ _id: 1 }).toArray();
        const domainIds = domains.map((ddoc) => ddoc._id);
        const start = Date.now();
        await report({ message: `Calculating shared RP across ${domainIds.length} domains` });
        await runAcrossDomains(domainIds, report);
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
        invalidateSharedRankingSnapshot();
        return true;
    }
    if (!domainId) {
        const domains = await domain.getMulti().toArray();
        await report({ message: `Found ${domains.length} domains` });
        for (const i in domains) {
            const start = Date.now();
            await runInDomain(domains[i]._id, report);
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
    } else await runInDomain(domainId, report);
    invalidateSharedRankingSnapshot();
    return true;
}

export const apply = (ctx) => ctx.addScript(
    'rp', 'Calculate RP for a domain, or the shared ranking across all domains.',
    Schema.object({ domainId: Schema.string() }), run,
);
