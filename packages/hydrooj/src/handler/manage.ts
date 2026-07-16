import { exec } from 'child_process';
import path from 'path';
import { inspect } from 'util';
import * as yaml from 'js-yaml';
import moment from 'moment-timezone';
import { omit } from 'lodash';
import { ObjectId } from 'mongodb';
import Schema from 'schemastery';
import {
    CannotEditSuperAdminError, NotLaunchedByPM2Error, UserNotFoundError, ValidationError, VerifyPasswordError,
} from '../error';
import { getHomePosterConfig, HOME_POSTER_CONFIG_KEY } from '../lib/home_poster';
import {
    buildPointLotteryConfigFromForm, ensureGlobalPointLotteryState, getPointLotteryConfig,
    POINT_LOTTERY_CONFIG_KEY, POINT_LOTTERY_POINTS_FIELD, POINT_LOTTERY_TOTAL_POINTS_FIELD,
    pointLotteryUserColl,
} from '../lib/point_lottery';
import { Logger } from '../logger';
import { PERM, PRIV, STATUS } from '../model/builtin';
import domain from '../model/domain';
import record from '../model/record';
import * as setting from '../model/setting';
import storage from '../model/storage';
import system from '../model/system';
import token from '../model/token';
import user, { User as HydroUser } from '../model/user';
import {
    ConnectionHandler, Handler, param, requireSudo, Types,
} from '../service/server';
import { Time } from '../utils';
import { JudgeResultCallbackContext } from './judge';

const logger = new Logger('manage');
const LOTTERY_PRIZE_IMAGE_LIMIT = 4 * 1024 * 1024;
const LOTTERY_PRIZE_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
type LotteryPointRankType = 'total' | 'current';
const LOTTERY_POINT_RANK_TYPES: LotteryPointRankType[] = ['total', 'current'];

function set(key: string, value: any) {
    if (setting.SYSTEM_SETTINGS_BY_KEY[key]) {
        const s = setting.SYSTEM_SETTINGS_BY_KEY[key];
        if (s.flag & setting.FLAG_DISABLED) return undefined;
        if ((s.flag & setting.FLAG_SECRET) && !value) return undefined;
        if (s.type === 'boolean') {
            if (value === 'on') return true;
            return false;
        }
        if (s.type === 'number') {
            if (!Number.isSafeInteger(+value)) throw new ValidationError(key);
            return +value;
        }
        if (s.subType === 'yaml') {
            try {
                yaml.load(value);
            } catch (e) {
                throw new ValidationError(key);
            }
        }
        return value;
    }
    return undefined;
}

function getRequestFile(files: any, key: string) {
    const file = files?.[key];
    if (Array.isArray(file)) return file[0];
    return file;
}

async function applyLotteryPrizeImageUploads(handler: Handler, args: any) {
    const files = handler.request.files || {};
    const indexedKeys = Object.keys({ ...args, ...files })
        .map((key) => /^prize(\d+)(?:Name|ImageFile)$/.exec(key)?.[1])
        .filter((index): index is string => index !== undefined)
        .map((index) => +index);
    const count = Math.max(
        Math.floor(+args.prizeCount || 0),
        indexedKeys.length ? Math.max(...indexedKeys) + 1 : 0,
    );
    const version = Date.now();
    for (let i = 0; i < count; i++) {
        const file = getRequestFile(files, `prize${i}ImageFile`);
        if (!file || !file.size) continue;
        if (file.size > LOTTERY_PRIZE_IMAGE_LIMIT) throw new ValidationError(`prize${i}ImageFile`);
        const ext = path.extname(file.originalFilename || '').toLowerCase();
        if (!LOTTERY_PRIZE_IMAGE_EXTS.includes(ext)) throw new ValidationError(`prize${i}ImageFile`);
        const filename = `lottery-prize-${version}-${i}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        await storage.put(`system/point-lottery/${filename}`, file.filepath, handler.user._id);
        args[`prize${i}Image`] = handler.url('point_lottery_prize_image', { filename, query: { v: version } });
    }
}

class SystemHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }
}

class SystemMainHandler extends SystemHandler {
    async get() {
        this.response.redirect = '/manage/dashboard';
    }
}

class SystemCheckConnHandler extends ConnectionHandler {
    id: string;

    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await this.check();
    }

    async check() {
        const log = (payload: any) => this.send({ type: 'log', payload });
        const warn = (payload: any) => this.send({ type: 'warn', payload });
        const error = (payload: any) => this.send({ type: 'error', payload });
        await this.ctx.check.run(this, log, warn, error, (id) => { this.id = id; });
    }

    async cleanup() {
        this.ctx.check.cancel(this.id);
    }
}

class SystemDashboardHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_dashboard.html';
    }

    async postRestart() {
        if (!process.env.pm_cwd) throw new NotLaunchedByPM2Error();
        exec(`pm2 reload "${process.env.name}"`);
        this.back();
    }
}

const RANKING_MODES = ['single', 'all'];
const TRAINING_DASHBOARD_SORTS = ['newAc30', 'submit30', 'acRate30', 'lastActive'];
const TRAINING_DASHBOARD_DOMAIN_IDS = ['system', 'C0001'];

type TrainingRangeStats = {
    submit: number;
    ac: number;
    activeDays: number;
    lastRecordId: any;
};

function roundChartNumber(value: number) {
    return Math.round(value * 10) / 10;
}

function buildTrainingChart(dailyData: any[]) {
    const width = 760;
    const height = 280;
    const padding = {
        top: 22,
        right: 24,
        bottom: 42,
        left: 48,
    };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const seriesDefs = [
        { key: 'submitCount', color: '#3b82f6' },
        { key: 'acCount', color: '#16a34a' },
        { key: 'newAcceptedProblemCount', color: '#f59e0b' },
        { key: 'activeUserCount', color: '#8b5cf6' },
    ];
    let maxValue = 1;
    let hasData = false;
    for (const row of dailyData) {
        for (const series of seriesDefs) {
            const value = row[series.key] || 0;
            if (value > 0) hasData = true;
            if (value > maxValue) maxValue = value;
        }
    }
    maxValue = Math.max(1, Math.ceil(maxValue));
    const valueToY = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight;
    const stepX = dailyData.length > 1 ? plotWidth / (dailyData.length - 1) : 0;
    const tickValues = Array.from(new Set([0, Math.ceil(maxValue / 2), maxValue])).sort((a, b) => a - b);
    const labelIndexes = Array.from(new Set([
        0,
        Math.floor((dailyData.length - 1) / 4),
        Math.floor((dailyData.length - 1) / 2),
        Math.floor(((dailyData.length - 1) * 3) / 4),
        dailyData.length - 1,
    ].filter((i) => i >= 0)));
    return {
        width,
        height,
        hasData,
        maxValue,
        plot: {
            left: padding.left,
            right: width - padding.right,
            top: padding.top,
            bottom: height - padding.bottom,
            width: plotWidth,
            height: plotHeight,
        },
        yTicks: tickValues.map((value) => ({
            value,
            y: roundChartNumber(valueToY(value)),
        })),
        xLabels: labelIndexes.map((index) => ({
            label: dailyData[index]?.date?.slice(5) || '',
            x: roundChartNumber(padding.left + index * stepX),
        })),
        series: seriesDefs.map((series) => {
            const points = dailyData.map((row, index) => {
                const x = padding.left + index * stepX;
                const y = valueToY(row[series.key] || 0);
                return `${roundChartNumber(x)},${roundChartNumber(y)}`;
            }).join(' ');
            return { ...series, points };
        }),
    };
}

async function getTrainingDashboardDomainIds(currentDomainId: string) {
    const preferredDomainIds = Array.from(new Set([currentDomainId, ...TRAINING_DASHBOARD_DOMAIN_IDS].filter(Boolean)));
    const preferredLowerIds = preferredDomainIds.map((id) => id.toLowerCase());
    const existingDomains = await domain.getMulti({
        $or: [
            { _id: { $in: preferredDomainIds } },
            { lower: { $in: preferredLowerIds } },
        ],
    }).project({ _id: 1 }).toArray();
    const existingDomainIds = new Map(existingDomains.map((ddoc) => [ddoc._id.toLowerCase(), ddoc._id]));
    const domainIds = preferredDomainIds
        .map((id) => existingDomainIds.get(id.toLowerCase()))
        .filter((id): id is string => !!id);
    return domainIds.length ? domainIds : [currentDomainId];
}

class SystemTrainingDashboardHandler extends SystemHandler {
    @param('q', Types.Content, true)
    @param('sort', Types.Range(TRAINING_DASHBOARD_SORTS), true)
    async get(domainId: string, q = '', sort = 'newAc30') {
        const dashboardDomainIds = await getTrainingDashboardDomainIds(domainId);
        const dashboardDomainLabel = dashboardDomainIds.join('、');
        const timeZone = this.user.timeZone || system.get('timeZone') || 'Asia/Shanghai';
        const now = moment().tz(timeZone);
        const start7 = now.clone().subtract(6, 'days').startOf('day');
        const start30 = now.clone().subtract(29, 'days').startOf('day');
        const days = Array.from({ length: 30 }, (_, i) => start30.clone().add(i, 'days').format('YYYY-MM-DD'));

        const joined = await domain.collUser.find({ domainId: { $in: dashboardDomainIds }, uid: { $gt: 1 }, join: true })
            .project({ uid: 1 })
            .toArray();
        const rawUids = Array.from(new Set(joined.map((i) => i.uid))).sort((a, b) => a - b);
        const userPrivDocs = rawUids.length
            ? await user.getMulti({ _id: { $in: rawUids } }, ['_id', 'priv']).toArray()
            : [];
        const studentUidSet = new Set(userPrivDocs
            .filter((udoc) => (udoc.priv & PRIV.PRIV_USER_PROFILE) && !(udoc.priv & PRIV.PRIV_EDIT_SYSTEM))
            .map((udoc) => udoc._id));
        const uids = rawUids.filter((uid) => studentUidSet.has(uid));
        const emptyDaily = Object.fromEntries(days.map((date) => [date, {
            date,
            submitCount: 0,
            acCount: 0,
            newAcceptedProblemCount: 0,
            activeUserCount: 0,
        }]));

        if (!uids.length) {
            this.response.template = 'manage_training_dashboard.html';
            this.response.body = {
                q,
                sort,
                dashboardDomainIds,
                dashboardDomainLabel,
                overview: {
                    totalStudents: 0,
                    active7: 0,
                    active30: 0,
                    submit7: 0,
                    ac7: 0,
                    submit30: 0,
                    ac30: 0,
                    newAc30: 0,
                },
                chart: buildTrainingChart(Object.values(emptyDaily)),
                fastest7: [],
                fastest30: [],
                rows: [],
                udict: {},
            };
            return;
        }

        const baseMatch = {
            domainId: { $in: dashboardDomainIds },
            uid: { $in: uids },
            pid: { $gt: 0 },
            contest: { $nin: [record.RECORD_PRETEST, record.RECORD_GENERATE] },
        };
        const acMatch = { ...baseMatch, status: STATUS.STATUS_ACCEPTED };
        const makeRangeStats = async (start: moment.Moment) => {
            const result = await record.coll.aggregate([
                { $match: { ...baseMatch, _id: { $gte: Time.getObjectID(start.toDate()) } } },
                {
                    $project: {
                        uid: 1,
                        status: 1,
                        day: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: { $toDate: '$_id' },
                                timezone: timeZone,
                            },
                        },
                    },
                },
                {
                    $group: {
                        _id: '$uid',
                        submit: { $sum: 1 },
                        ac: { $sum: { $cond: [{ $eq: ['$status', STATUS.STATUS_ACCEPTED] }, 1, 0] } },
                        activeDays: { $addToSet: '$day' },
                        lastRecordId: { $max: '$_id' },
                    },
                },
            ]).toArray();
            const map: Record<number, TrainingRangeStats> = {};
            for (const row of result) {
                map[row._id] = {
                    submit: row.submit,
                    ac: row.ac,
                    activeDays: row.activeDays.length,
                    lastRecordId: row.lastRecordId,
                };
            }
            return map;
        };

        const [
            totalStats,
            range7,
            range30,
            dailyRows,
            firstAccepted,
            udict,
        ] = await Promise.all([
            record.coll.aggregate([
                { $match: baseMatch },
                {
                    $group: {
                        _id: '$uid',
                        totalSubmit: { $sum: 1 },
                        totalAc: { $sum: { $cond: [{ $eq: ['$status', STATUS.STATUS_ACCEPTED] }, 1, 0] } },
                        lastRecordId: { $max: '$_id' },
                    },
                },
            ]).toArray(),
            makeRangeStats(start7),
            makeRangeStats(start30),
            record.coll.aggregate([
                { $match: { ...baseMatch, _id: { $gte: Time.getObjectID(start30.toDate()) } } },
                {
                    $project: {
                        uid: 1,
                        status: 1,
                        day: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: { $toDate: '$_id' },
                                timezone: timeZone,
                            },
                        },
                    },
                },
                {
                    $group: {
                        _id: '$day',
                        submitCount: { $sum: 1 },
                        acCount: { $sum: { $cond: [{ $eq: ['$status', STATUS.STATUS_ACCEPTED] }, 1, 0] } },
                        activeUsers: { $addToSet: '$uid' },
                    },
                },
            ]).toArray(),
            record.coll.aggregate([
                { $match: acMatch },
                {
                    $group: {
                        _id: { uid: '$uid', domainId: '$domainId', pid: '$pid' },
                        firstRecordId: { $min: '$_id' },
                    },
                },
            ]).toArray(),
            user.getListForRender(domainId, uids, this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO)),
        ]);

        const totalMap: Record<number, any> = {};
        for (const row of totalStats) totalMap[row._id] = row;
        for (const row of dailyRows) {
            if (!emptyDaily[row._id]) continue;
            emptyDaily[row._id].submitCount = row.submitCount;
            emptyDaily[row._id].acCount = row.acCount;
            emptyDaily[row._id].activeUserCount = row.activeUsers.length;
        }

        const firstAcceptedCount: Record<number, number> = {};
        const newAc7: Record<number, number> = {};
        const newAc30: Record<number, number> = {};
        for (const row of firstAccepted) {
            const uid = row._id.uid;
            const acceptedAt = row.firstRecordId.getTimestamp();
            firstAcceptedCount[uid] = (firstAcceptedCount[uid] || 0) + 1;
            if (acceptedAt >= start30.toDate()) {
                newAc30[uid] = (newAc30[uid] || 0) + 1;
                const day = moment(acceptedAt).tz(timeZone).format('YYYY-MM-DD');
                if (emptyDaily[day]) emptyDaily[day].newAcceptedProblemCount++;
            }
            if (acceptedAt >= start7.toDate()) newAc7[uid] = (newAc7[uid] || 0) + 1;
        }

        const rows = uids.map((uid) => {
            const total = totalMap[uid] || {};
            const r7 = range7[uid] || { submit: 0, ac: 0, activeDays: 0, lastRecordId: null };
            const r30 = range30[uid] || { submit: 0, ac: 0, activeDays: 0, lastRecordId: null };
            return {
                uid,
                totalSubmit: total.totalSubmit || 0,
                totalAc: total.totalAc || 0,
                totalAcceptedProblems: firstAcceptedCount[uid] || 0,
                submit7: r7.submit,
                ac7: r7.ac,
                newAc7: newAc7[uid] || 0,
                submit30: r30.submit,
                ac30: r30.ac,
                newAc30: newAc30[uid] || 0,
                activeDays7: r7.activeDays,
                activeDays30: r30.activeDays,
                acRate7: r7.submit ? Math.round((r7.ac / r7.submit) * 1000) / 10 : 0,
                acRate30: r30.submit ? Math.round((r30.ac / r30.submit) * 1000) / 10 : 0,
                lastActive: total.lastRecordId || null,
                lastActiveTime: total.lastRecordId?.getTimestamp?.().getTime?.() || 0,
            };
        });

        const compareWindow = (range: 7 | 30) => (a, b) => (
            b[`newAc${range}`] - a[`newAc${range}`]
            || b[`ac${range}`] - a[`ac${range}`]
            || b[`activeDays${range}`] - a[`activeDays${range}`]
            || b[`acRate${range}`] - a[`acRate${range}`]
            || a[`submit${range}`] - b[`submit${range}`]
            || b.lastActiveTime - a.lastActiveTime
        );
        const detailCompare = {
            newAc30: (a, b) => compareWindow(30)(a, b),
            submit30: (a, b) => b.submit30 - a.submit30 || compareWindow(30)(a, b),
            acRate30: (a, b) => b.acRate30 - a.acRate30 || compareWindow(30)(a, b),
            lastActive: (a, b) => b.lastActiveTime - a.lastActiveTime || compareWindow(30)(a, b),
        };
        const query = q.trim().toLowerCase();
        const filteredRows = query
            ? rows.filter((row) => {
                const udoc = udict[row.uid] || {};
                return [udoc.uname, udoc.displayName].some((value) => `${value || ''}`.toLowerCase().includes(query));
            })
            : rows;
        const range7Values = Object.values(range7) as TrainingRangeStats[];
        const range30Values = Object.values(range30) as TrainingRangeStats[];
        const fastest7 = rows.filter((row) => row.submit7 || row.ac7 || row.newAc7).sort(compareWindow(7)).slice(0, 10);
        const fastest30 = rows.filter((row) => row.submit30 || row.ac30 || row.newAc30).sort(compareWindow(30)).slice(0, 10);

        this.response.template = 'manage_training_dashboard.html';
        this.response.body = {
            q,
            sort,
            dashboardDomainIds,
            dashboardDomainLabel,
            overview: {
                totalStudents: uids.length,
                active7: Object.keys(range7).length,
                active30: Object.keys(range30).length,
                submit7: range7Values.reduce((sum, row) => sum + row.submit, 0),
                ac7: range7Values.reduce((sum, row) => sum + row.ac, 0),
                submit30: range30Values.reduce((sum, row) => sum + row.submit, 0),
                ac30: range30Values.reduce((sum, row) => sum + row.ac, 0),
                newAc30: Object.values(newAc30).reduce((sum, value) => sum + value, 0),
            },
            chart: buildTrainingChart(Object.values(emptyDaily)),
            fastest7,
            fastest30,
            rows: filteredRows.sort(detailCompare[sort]).slice(0, 500),
            udict,
        };
    }
}

class SystemSharedRankingHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_shared_ranking.html';
        this.response.body = {
            mode: system.get('ranking.mode') === 'all' ? 'all' : 'single',
        };
    }

    @param('mode', Types.Range(RANKING_MODES))
    async post(domainId: string, mode: string) {
        await system.set('ranking.mode', mode);
        this.back();
    }
}

class SystemScriptHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_script.html';
        this.response.body.scripts = global.Hydro.script;
    }

    @param('id', Types.Name)
    @param('args', Types.Content, true)
    async post(domainId: string, id: string, raw = '{}') {
        if (!global.Hydro.script[id]) throw new ValidationError('id');
        let args = JSON.parse(raw);
        if (typeof global.Hydro.script[id].validate === 'function') {
            args = global.Hydro.script[id].validate(args);
        }
        const rid = await record.add(domainId, -1, this.user._id, '-', id, false, { input: [raw], type: 'pretest' });
        const c = new JudgeResultCallbackContext(this.ctx, { type: 'judge', domainId, rid });
        c.next({ message: `Running script: ${id} `, status: STATUS.STATUS_JUDGING });
        const start = Date.now();
        // Maybe async?
        global.Hydro.script[id].run(args, (data) => c.next(data))
            .then((ret: any) => c.end({
                status: STATUS.STATUS_ACCEPTED,
                message: inspect(ret, false, 10, true),
                judger: 1,
                time: Date.now() - start,
                memory: 0,
            }))
            .catch((err: Error) => {
                logger.error(err);
                c.end({
                    status: STATUS.STATUS_SYSTEM_ERROR,
                    message: `${err.message} \n${(err as any).params || []} \n${err.stack} `,
                    judger: 1,
                    time: Date.now() - start,
                    memory: 0,
                });
            });
        this.response.body = { rid };
        this.response.redirect = this.url('record_detail', { rid });
    }
}

class SystemSettingHandler extends SystemHandler {
    @requireSudo
    async get() {
        this.response.template = 'manage_setting.html';
        this.response.body.current = {};
        this.response.body.settings = setting.SYSTEM_SETTINGS;
        for (const s of this.response.body.settings) {
            this.response.body.current[s.key] = system.get(s.key);
        }
    }

    @requireSudo
    async post(args: any) {
        const tasks = [];
        const booleanKeys = args.booleanKeys || {};
        delete args.booleanKeys;
        for (const key in args) {
            if (typeof args[key] === 'object') {
                for (const subkey in args[key]) {
                    const val = set(`${key}.${subkey}`, args[key][subkey]);
                    if (val !== undefined) {
                        tasks.push(system.set(`${key}.${subkey}`, val));
                    }
                }
            }
        }
        for (const key in booleanKeys) {
            if (typeof booleanKeys[key] === 'object') {
                for (const subkey in booleanKeys[key]) {
                    if (!args[key]?.[subkey]) tasks.push(system.set(`${key}.${subkey}`, false));
                }
            }
        }
        await Promise.all(tasks);
        this.ctx.broadcast('system/setting', args);
        this.back();
    }
}

class SystemConfigHandler extends SystemHandler {
    @requireSudo
    async get() {
        this.response.template = 'manage_config.html';
        let value = this.ctx.setting.configSource;

        const processNode = (node: any, schema: Schema<any, any>, parent?: any, accessKey?: string) => {
            if (!node) return;
            if (['union', 'intersect'].includes(schema.type)) {
                for (const item of schema.list) processNode(node, item, parent, accessKey);
            }
            if (parent && (schema.meta.secret === true || schema.meta.role === 'secret')) {
                if (schema.type === 'string') parent[accessKey] = '[hidden]';
                // TODO support more types
            }
            if (schema.type === 'object') {
                for (const key in schema.dict) processNode(node[key], schema.dict[key], node, key);
            }
        };

        try {
            const temp = yaml.load(this.ctx.setting.configSource);
            for (const schema of this.ctx.setting.settings) processNode(temp, schema);
            value = yaml.dump(temp);
        } catch (e) {
            logger.error('Failed to process config', e.message);
        }
        this.response.body = {
            schema: Schema.intersect(this.ctx.setting.settings).toJSON(),
            value,
        };
    }

    @requireSudo
    @param('value', Types.String)
    async post({ }, value: string) {
        const oldConfig = yaml.load(this.ctx.setting.configSource);
        let config;
        const processNode = (node: any, old: any, schema: Schema<any, any>, parent?: any, accessKey?: string) => {
            if (['union', 'intersect'].includes(schema.type)) {
                for (const item of schema.list) processNode(node, old, item, parent, accessKey);
            }
            if (parent && (schema.meta.secret === true || schema.meta.role === 'secret')) {
                if (node === '[hidden]') parent[accessKey] = old;
                // TODO support more types
            }
            if (schema.type === 'object') {
                for (const key in schema.dict) processNode(node[key] || {}, old[key] || {}, schema.dict[key], node, key);
            }
        };

        try {
            config = yaml.load(value);
            for (const schema of this.ctx.setting.settings) processNode(config, oldConfig, schema, null, '');
        } catch (e) {
            throw new ValidationError('value', '', e.message);
        }
        await this.ctx.setting.saveConfig(config);
    }
}

/* eslint-disable no-await-in-loop */
class SystemUserImportHandler extends SystemHandler {
    async get() {
        this.response.body.users = [];
        this.response.template = 'manage_user_import.html';
    }

    @param('users', Types.Content)
    @param('draft', Types.Boolean)
    async post(domainId: string, _users: string, draft: boolean) {
        const users = _users.split('\n');
        const udocs: { email: string, username: string, password: string, displayName?: string, [key: string]: any }[] = [];
        const messages = [];
        const mapping = Object.create(null);
        const groups: Record<string, string[]> = Object.create(null);
        for (const i in users) {
            const u = users[i];
            if (!u.trim()) continue;
            let [email, username, password, displayName, extra] = u.split('\t').map((t) => t.trim());
            if (!email || !username || !password) {
                const data = u.split(',').map((t) => t.trim());
                [email, username, password, displayName, extra] = data;
                if (data.length > 5) extra = data.slice(4).join(',');
            }
            if (email && username && password) {
                if (!Types.Email[1](email)) messages.push(`Line ${+i + 1}: Invalid email.`);
                else if (!Types.Username[1](username)) messages.push(`Line ${+i + 1}: Invalid username`);
                else if (!Types.Password[1](password)) messages.push(`Line ${+i + 1}: Invalid password`);
                else if (udocs.find((t) => t.email === email) || await user.getByEmail('system', email)) {
                    messages.push(`Line ${+i + 1}: Email ${email} already exists.`);
                } else if (udocs.find((t) => t.username === username) || await user.getByUname('system', username)) {
                    messages.push(`Line ${+i + 1}: Username ${username} already exists.`);
                } else {
                    const payload: any = {};
                    try {
                        const data = JSON.parse(extra);
                        if (data.group) {
                            groups[data.group] ||= [];
                            groups[data.group].push(email);
                        }
                        Object.assign(payload, data);
                    } catch (e) { }
                    Object.assign(payload, {
                        email, username, password, displayName,
                    });
                    await this.ctx.serial('user/import/parse', payload);
                    udocs.push(payload);
                }
            } else messages.push(`Line ${+i + 1}: Input invalid.`);
        }
        messages.push(`${udocs.length} users found.`);
        if (!draft) {
            for (const udoc of udocs) {
                try {
                    const uid = await user.create(udoc.email, udoc.username, udoc.password);
                    mapping[udoc.email] = uid;
                    if (udoc.displayName) await domain.setUserInDomain(domainId, uid, { displayName: udoc.displayName });
                    if (udoc.school) await user.setById(uid, { school: udoc.school });
                    if (udoc.studentId) await user.setById(uid, { studentId: udoc.studentId });
                    await this.ctx.serial('user/import/create', uid, udoc);
                } catch (e) {
                    messages.push(e.message);
                }
            }
            const existing = await user.listGroup(domainId);
            for (const name in groups) {
                const uids = groups[name].map((i) => mapping[i]).filter((i) => i);
                const current = existing.find((i) => i.name === name)?.uids || [];
                if (uids.length) await user.updateGroup(domainId, name, Array.from(new Set([...current, ...uids])));
            }
        }
        this.response.body.users = udocs;
        this.response.body.messages = messages;
    }
}
/* eslint-enable no-await-in-loop */

const Priv = omit(PRIV, ['PRIV_DEFAULT', 'PRIV_NEVER', 'PRIV_NONE', 'PRIV_ALL']);
const allPriv = Math.sum(Object.values(Priv));

async function getManageTargetUser(domainId: string, query: string) {
    const q = query.trim();
    if (!q) return null;
    const uid = /^\d+$/.test(q) ? +q : null;
    if (uid !== null) return user.getById(domainId, uid);
    return user.getByUname(domainId, q);
}

function checkPasswordResetTarget(udoc: HydroUser) {
    if (isPasswordResetProtectedTarget(udoc)) throw new CannotEditSuperAdminError();
}

function isPasswordResetProtectedTarget(udoc: HydroUser) {
    return udoc._id <= 1 || udoc.priv === -1 || udoc.priv === allPriv;
}

class SystemUserManagementHandler extends SystemHandler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_ALL);
    }

    @requireSudo
    @param('q', Types.Content, true)
    @param('reset', Types.Int, true)
    async get(domainId: string, q = '', reset = 0) {
        const target = q.trim() ? await getManageTargetUser(domainId, q) : null;
        this.response.template = 'manage_user_management.html';
        this.response.body = {
            q,
            target,
            canResetTarget: target ? !isPasswordResetProtectedTarget(target) : false,
            reset,
        };
    }

    @requireSudo
    @param('uid', Types.Int)
    @param('password', Types.Password)
    @param('verifyPassword', Types.Password)
    async postResetPassword(domainId: string, uid: number, password: string, verifyPassword: string) {
        if (password !== verifyPassword) throw new VerifyPasswordError();
        const target = await user.getById(domainId, uid);
        if (!target) throw new UserNotFoundError(uid);
        checkPasswordResetTarget(target);
        await user.setPassword(uid, password);
        await token.delByUid(uid);
        this.response.redirect = this.url('manage_user_management', { query: { q: uid, reset: uid } });
    }
}

class SystemHomePosterHandler extends SystemHandler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_ALL);
    }

    @requireSudo
    @param('saved', Types.Int, true)
    @param('cleared', Types.Int, true)
    async get(domainId: string, saved = 0, cleared = 0) {
        const config = getHomePosterConfig();
        if (config.storagePath) {
            config.image = this.url('home_poster_image', {
                query: { v: config.updatedAt || '' },
            });
        }
        this.response.template = 'manage_home_poster.html';
        this.response.body = {
            config,
            configKey: HOME_POSTER_CONFIG_KEY,
            saved,
            cleared,
            recommendedRatio: '18:5',
            recommendedSize: '2160 x 600',
        };
    }

    @requireSudo
    async postUpload() {
        const file = this.request.files?.file;
        if (!file) throw new ValidationError('poster');
        if (file.size > 8 * 1024 * 1024) throw new ValidationError('poster');

        const ext = path.extname(file.originalFilename || '').toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) throw new ValidationError('poster');

        const oldConfig = getHomePosterConfig();
        const filename = `home-poster-${Date.now()}${ext}`;
        const storagePath = `user/${this.user._id}/${filename}`;
        await storage.put(storagePath, file.filepath, this.user._id);
        if (oldConfig.storagePath && oldConfig.storagePath !== storagePath) {
            storage.del([oldConfig.storagePath], this.user._id).catch((e) => logger.error(e));
        }
        const updatedAt = new Date().toISOString();
        await system.set(HOME_POSTER_CONFIG_KEY, {
            image: this.url('home_poster_image', { query: { v: updatedAt } }),
            storagePath,
            updatedAt,
        });
        this.response.redirect = this.url('manage_home_poster', { query: { saved: 1 } });
    }

    @requireSudo
    async postClear() {
        const oldConfig = getHomePosterConfig();
        if (oldConfig.storagePath) {
            storage.del([oldConfig.storagePath], this.user._id).catch((e) => logger.error(e));
        }
        await system.set(HOME_POSTER_CONFIG_KEY, { image: '' });
        this.response.redirect = this.url('manage_home_poster', { query: { cleared: 1 } });
    }
}

class SystemLotteryHandler extends SystemHandler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_ALL);
    }

    @requireSudo
    @param('q', Types.Content, true)
    @param('rankBy', Types.Range(LOTTERY_POINT_RANK_TYPES), true)
    @param('saved', Types.Int, true)
    @param('added', Types.Int, true)
    @param('adjusted', Types.Int, true)
    @param('deleted', Types.Int, true)
    @param('cleared', Types.Int, true)
    async get(
        domainId: string, q = '', rankBy: typeof LOTTERY_POINT_RANK_TYPES[number] = 'total',
        saved = 0, added = 0, adjusted = 0, deleted = 0, cleared = 0,
    ) {
        const config = getPointLotteryConfig();
        const target = q.trim() ? await getManageTargetUser(domainId, q) : null;
        const targetPointState = target ? await ensureGlobalPointLotteryState(target._id) : null;
        const pointRankField = rankBy === 'current' ? '$currentPoints' : '$totalPoints';
        const pointRankDocs = await pointLotteryUserColl.aggregate([
            {
                $match: {
                    _id: { $gt: 1 },
                    $or: [
                        { [POINT_LOTTERY_POINTS_FIELD]: { $gt: 0 } },
                        { [POINT_LOTTERY_TOTAL_POINTS_FIELD]: { $gt: 0 } },
                    ],
                },
            },
            {
                $project: {
                    uid: '$_id',
                    currentPoints: { $ifNull: [`$${POINT_LOTTERY_POINTS_FIELD}`, 0] },
                    totalPoints: {
                        $ifNull: [
                            `$${POINT_LOTTERY_TOTAL_POINTS_FIELD}`,
                            { $ifNull: [`$${POINT_LOTTERY_POINTS_FIELD}`, 0] },
                        ],
                    },
                },
            },
            { $addFields: { rankPoints: pointRankField } },
            { $match: { rankPoints: { $gt: 0 } } },
            { $sort: { rankPoints: -1, uid: 1 } },
            { $limit: 30 },
        ]).toArray();
        const pointRankUids = pointRankDocs.map((row: any) => row.uid);
        const pointRankUdict = pointRankUids.length ? await user.getListForRender(domainId, pointRankUids, false) : {};
        const pointRankRows = pointRankDocs.map((row: any, index: number) => ({
            rank: index + 1,
            uid: row.uid,
            udoc: pointRankUdict[row.uid] || { _id: row.uid, uname: `${row.uid}` },
            currentPoints: Math.max(0, Math.floor(+row.currentPoints || 0)),
            totalPoints: Math.max(0, Math.floor(+row.totalPoints || 0)),
            rankPoints: Math.max(0, Math.floor(+row.rankPoints || 0)),
        }));
        const logs = await this.ctx.db.collection('lottery.draw')
            .find({ domainId, deleted: { $ne: true } })
            .sort({ createdAt: -1, _id: -1 })
            .limit(20)
            .toArray();
        const logUids = Array.from(new Set(logs.map((log) => log.uid).filter((uid) => typeof uid === 'number')));
        const logUdict = logUids.length ? await user.getListForRender(domainId, logUids, false) : {};
        const logRows = logs.map((log) => ({
            ...log,
            drawId: log._id?.toHexString?.() || `${log._id}`,
            udoc: logUdict[log.uid] || { _id: log.uid, uname: `${log.uid}` },
        }));
        this.response.template = 'manage_lottery.html';
        this.response.body = {
            config,
            configKey: POINT_LOTTERY_CONFIG_KEY,
            prizeSlots: (config.prizes.length ? config.prizes : [{
                name: '',
                image: '',
                probability: '',
                pointDelta: 0,
                repeatable: true,
                broadcast: true,
            }]),
            q,
            rankBy,
            target,
            canAddTarget: target ? !isPasswordResetProtectedTarget(target) : false,
            targetPoints: Math.max(0, Math.floor(+targetPointState?.[POINT_LOTTERY_POINTS_FIELD] || 0)),
            targetTotalPoints: Math.max(0, Math.floor(+(
                targetPointState?.[POINT_LOTTERY_TOTAL_POINTS_FIELD] ?? targetPointState?.[POINT_LOTTERY_POINTS_FIELD]
            ) || 0)),
            saved,
            added,
            adjusted,
            deleted,
            cleared,
            logRows,
            pointRankRows,
        };
    }

    @requireSudo
    async postSaveConfig() {
        const args = { ...this.args };
        await applyLotteryPrizeImageUploads(this, args);
        const config = buildPointLotteryConfigFromForm(args);
        await system.set(POINT_LOTTERY_CONFIG_KEY, config);
        this.response.redirect = this.url('manage_lottery', { query: { saved: 1 } });
    }

    @requireSudo
    @param('q', Types.Content)
    @param('points', Types.Int)
    async postAddPoints(domainId: string, q: string, points: number) {
        if (points <= 0) throw new ValidationError('points');
        const target = await getManageTargetUser(domainId, q);
        if (!target) throw new UserNotFoundError(q);
        if (isPasswordResetProtectedTarget(target)) throw new CannotEditSuperAdminError();
        const pointState = await ensureGlobalPointLotteryState(target._id);
        const initialTotalPoints = pointState && pointState[POINT_LOTTERY_TOTAL_POINTS_FIELD] === undefined
            ? Math.max(0, Math.floor(+pointState[POINT_LOTTERY_POINTS_FIELD] || 0))
            : null;
        const update: any = {
            $inc: { [POINT_LOTTERY_POINTS_FIELD]: points },
        };
        if (initialTotalPoints === null) update.$inc[POINT_LOTTERY_TOTAL_POINTS_FIELD] = points;
        else update.$set = { [POINT_LOTTERY_TOTAL_POINTS_FIELD]: initialTotalPoints + points };
        await pointLotteryUserColl.updateOne({ _id: target._id }, update);
        this.response.redirect = this.url('manage_lottery', { query: { q, added: points } });
    }

    @requireSudo
    @param('q', Types.Content)
    @param('points', Types.Int)
    @param('scope', Types.Range(['current', 'total']))
    async postDeductPoints(domainId: string, q: string, points: number, scope: 'current' | 'total') {
        if (points <= 0) throw new ValidationError('points');
        const target = await getManageTargetUser(domainId, q);
        if (!target) throw new UserNotFoundError(q);
        if (isPasswordResetProtectedTarget(target)) throw new CannotEditSuperAdminError();
        const field = scope === 'current' ? POINT_LOTTERY_POINTS_FIELD : POINT_LOTTERY_TOTAL_POINTS_FIELD;
        const pointState = await ensureGlobalPointLotteryState(target._id);
        const fallback = scope === 'total' ? pointState?.[POINT_LOTTERY_POINTS_FIELD] : 0;
        const current = Math.max(0, Math.floor(+(pointState?.[field] ?? fallback) || 0));
        await pointLotteryUserColl.updateOne({ _id: target._id }, {
            $set: { [field]: Math.max(0, current - points) },
        });
        this.response.redirect = this.url('manage_lottery', { query: { q, adjusted: points } });
    }

    @requireSudo
    @param('drawId', Types.ObjectId)
    async postDeleteDraw(domainId: string, drawId: ObjectId) {
        await this.ctx.db.collection('lottery.draw').updateOne(
            { _id: drawId, domainId },
            { $set: { deleted: true, deletedAt: new Date(), deletedBy: this.user._id } },
        );
        this.response.redirect = this.url('manage_lottery', { query: { deleted: 1 } });
    }

    @requireSudo
    async postClearDraws() {
        await this.ctx.db.collection('lottery.draw').deleteMany({});
        this.response.redirect = this.url('manage_lottery', { query: { cleared: 1 } });
    }
}

class SystemUserPrivHandler extends SystemHandler {
    @requireSudo
    @param('extraIgnore', Types.NumericArray, true)
    async get({ }, extraIgnore: number[] = []) {
        const defaultPriv = system.get('default.priv');
        const udocs = await user.getMulti({
            _id: { $gte: -1000, $ne: 1 }, priv: { $nin: [0, defaultPriv, ...extraIgnore] },
        }).limit(1000).sort({ _id: 1 }).toArray();
        const banudocs = await user.getMulti({ _id: { $gte: -1000, $ne: 1 }, priv: 0 }).limit(1000).sort({ _id: 1 }).toArray();
        this.response.body = {
            udocs: [...udocs, ...banudocs],
            defaultPriv,
            Priv,
        };
        this.response.pjax = 'partials/manage_user_priv.html';
        this.response.template = 'manage_user_priv.html';
    }

    @requireSudo
    @param('uid', Types.Int)
    @param('priv', Types.UnsignedInt)
    @param('system', Types.Boolean)
    async post(domainId: string, uid: number, priv: number, editSystem: boolean) {
        if (!editSystem) {
            const udoc = await user.getById(domainId, uid);
            if (!udoc) throw new UserNotFoundError(uid);
            if (udoc.priv === -1 || priv === -1 || priv === allPriv) throw new CannotEditSuperAdminError();
            await user.setPriv(uid, priv);
        } else {
            const defaultPriv = system.get('default.priv');
            await user.coll.updateMany({ priv: defaultPriv }, { $set: { priv } });
            await system.set('default.priv', priv);
            this.ctx.broadcast('user/delcache', true);
        }
        this.back();
    }
}

export const inject = ['setting', 'check'];
export async function apply(ctx) {
    ctx.Route('manage', '/manage', SystemMainHandler);
    ctx.Route('manage_dashboard', '/manage/dashboard', SystemDashboardHandler);
    ctx.Route('manage_shared_ranking', '/manage/shared-ranking', SystemSharedRankingHandler);
    ctx.Route('manage_training_dashboard', '/manage/training-dashboard', SystemTrainingDashboardHandler);
    ctx.injectUI('ControlPanel', 'manage_shared_ranking', { before: 'manage_training_dashboard' });
    ctx.injectUI('ControlPanel', 'manage_training_dashboard', { before: 'manage_script' });
    ctx.Route('manage_script', '/manage/script', SystemScriptHandler);
    ctx.Route('manage_setting', '/manage/setting', SystemSettingHandler);
    ctx.Route('manage_config', '/manage/config', SystemConfigHandler);
    ctx.Route('manage_user_management', '/manage/users', SystemUserManagementHandler);
    ctx.injectUI('ControlPanel', 'manage_user_management', { before: 'manage_user_import', icon: 'user' }, PRIV.PRIV_ALL);
    ctx.Route('manage_user_import', '/manage/userimport', SystemUserImportHandler);
    ctx.Route('manage_user_priv', '/manage/userpriv', SystemUserPrivHandler);
    ctx.Route('manage_home_poster', '/manage/home-poster', SystemHomePosterHandler);
    ctx.injectUI('ControlPanel', 'manage_home_poster', { before: 'manage_lottery', icon: 'image' }, PRIV.PRIV_ALL);
    ctx.Route('manage_lottery', '/manage/lottery', SystemLotteryHandler);
    ctx.injectUI('ControlPanel', 'manage_lottery', { icon: 'gift' }, PRIV.PRIV_ALL);
    ctx.Connection('manage_check', '/manage/check-conn', SystemCheckConnHandler);
}
