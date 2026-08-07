import { exec } from 'child_process';
import path from 'path';
import { inspect } from 'util';
import * as yaml from 'js-yaml';
import { omit } from 'lodash';
import moment from 'moment-timezone';
import { ObjectId } from 'mongodb';
import Schema from 'schemastery';
import { randomstring } from '@hydrooj/utils';
import {
    CannotEditSuperAdminError, NotLaunchedByPM2Error, PermissionError, UserAlreadyExistError, UserNotFoundError, ValidationError,
    VerifyPasswordError,
} from '../error';
import type { CppEditorMode } from '../interface';
import {
    buildPointLotteryConfigFromForm, ensureGlobalPointLotteryState, getPointLotteryConfig, getPointLotteryStoragePrefix,
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
import user, { handleMailLower, User as HydroUser } from '../model/user';
import workspace from '../model/workspace';
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
    const uploads: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
        const file = getRequestFile(files, `prize${i}ImageFile`);
        if (!file || !file.size) continue;
        if (file.size > LOTTERY_PRIZE_IMAGE_LIMIT) throw new ValidationError(`prize${i}ImageFile`);
        const ext = path.extname(file.originalFilename || '').toLowerCase();
        if (!LOTTERY_PRIZE_IMAGE_EXTS.includes(ext)) throw new ValidationError(`prize${i}ImageFile`);
        const filename = `lottery-prize-${version}-${i}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        const storagePath = `${getPointLotteryStoragePrefix(handler.domain)}/${filename}`;
        uploads.push(storage.put(storagePath, file.filepath, handler.user._id).then(() => {
            args[`prize${i}Image`] = handler.url('point_lottery_prize_image', { filename, query: { v: version } });
        }));
    }
    await Promise.all(uploads);
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

const TRAINING_DASHBOARD_SORTS = ['newAc30', 'submit30', 'acRate30', 'lastActive'];

interface TrainingRangeStats {
    submit: number;
    ac: number;
    activeDays: number;
    lastRecordId: any;
}

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

interface TrainingDashboardDomain {
    id: string;
    name: string;
}

async function getTrainingDashboardDomains(): Promise<TrainingDashboardDomain[]> {
    const ddocs = await workspace.getDomains(workspace.LEGACY_WORKSPACE_ID);
    return ddocs.map((ddoc) => ({ id: ddoc._id, name: ddoc.name || ddoc._id }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

class SystemTrainingDashboardHandler extends SystemHandler {
    @param('q', Types.Content, true)
    @param('sort', Types.Range(TRAINING_DASHBOARD_SORTS), true)
    @param('domain', Types.String, true)
    async get(domainId: string, q = '', sort = 'newAc30', selectedDashboardDomain = 'all') {
        const dashboardDomains = await getTrainingDashboardDomains();
        const selectedDomain = selectedDashboardDomain === 'all'
            ? null
            : dashboardDomains.find((item) => item.id.toLowerCase() === selectedDashboardDomain.toLowerCase());
        if (selectedDashboardDomain !== 'all' && !selectedDomain) throw new ValidationError('domain');
        const dashboardDomainIds = selectedDomain ? [selectedDomain.id] : dashboardDomains.map((item) => item.id);
        const dashboardDomainLabel = selectedDomain ? selectedDomain.name : '所有域';
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
        const excludedLegacyUids = await workspace.getExcludedLegacyUids();
        const studentUidSet = new Set(userPrivDocs
            .filter((udoc) => (udoc.priv & PRIV.PRIV_USER_PROFILE)
                && !(udoc.priv & PRIV.PRIV_EDIT_SYSTEM)
                && !excludedLegacyUids.has(udoc._id))
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
                dashboardDomains,
                selectedDashboardDomain: selectedDomain?.id || 'all',
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
            user.getListForRender('system', uids, this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO)),
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
                const udoc = (udict[row.uid] || {}) as { uname?: string, displayName?: string };
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
            dashboardDomains,
            selectedDashboardDomain: selectedDomain?.id || 'all',
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
const MANAGED_STUDENT_SORTS = ['submit', 'login', 'practice'];
const MANAGED_STUDENT_SORT_DIRECTIONS = ['desc', 'asc'];
const CPP_EDITOR_MODES: CppEditorMode[] = ['beginner', 'preset', 'proficient'];
type ManagedStudentSort = 'submit' | 'login' | 'practice';
type ManagedStudentSortDirection = 'desc' | 'asc';

async function getManageTargetUser(domainId: string, query: string) {
    const q = query.trim();
    if (!q) return null;
    const uid = /^\d+$/.test(q) ? +q : null;
    if (uid !== null) return user.getById(domainId, uid);
    return user.getByUname(domainId, q);
}

function isPasswordResetProtectedTarget(udoc: HydroUser) {
    return udoc._id <= 1 || udoc.priv === -1 || udoc.priv === allPriv;
}

function checkPasswordResetTarget(udoc: HydroUser) {
    if (isPasswordResetProtectedTarget(udoc)) throw new CannotEditSuperAdminError();
}

function isManagedStudent(udoc: Pick<HydroUser, '_id' | 'priv'>) {
    return udoc._id > 1
        && !!(udoc.priv & PRIV.PRIV_USER_PROFILE)
        && !(udoc.priv & PRIV.PRIV_EDIT_SYSTEM)
        && !(udoc.priv & PRIV.PRIV_JUDGE);
}

function normalizeManagedStudentText(value: string, key: string) {
    const result = value.trim();
    if (result.length > 255) throw new ValidationError(key);
    return result;
}

function resolveManagedStudentCppEditorMode(
    globalValue: unknown, legacyValue?: unknown, legacyCppStarterTemplate?: boolean,
): CppEditorMode {
    if (typeof globalValue === 'string' && CPP_EDITOR_MODES.includes(globalValue as CppEditorMode)) {
        return globalValue as CppEditorMode;
    }
    if (typeof legacyValue === 'string' && CPP_EDITOR_MODES.includes(legacyValue as CppEditorMode)) {
        return legacyValue as CppEditorMode;
    }
    return legacyCppStarterTemplate ? 'preset' : 'proficient';
}

async function getManagedStudents(
    allDomains: ManagedStudentDomain[], sort: ManagedStudentSort, direction: ManagedStudentSortDirection,
) {
    const domainIds = allDomains.map((item) => item.id);
    const joined = await domain.collUser.find({ domainId: { $in: domainIds }, uid: { $gt: 1 }, join: true })
        .project<{
            uid: number; domainId: string; displayName?: string; nSubmit?: number; nAccept?: number;
        }>({
            uid: 1, domainId: 1, displayName: 1, nSubmit: 1, nAccept: 1,
        })
        .toArray();
    const candidateUids = Array.from(new Set(joined.map((row) => row.uid)));
    if (!candidateUids.length) return [];
    const userPrivDocs = await user.getMulti({ _id: { $in: candidateUids } }, ['_id', 'priv']).toArray();
    const excludedLegacyUids = await workspace.getExcludedLegacyUids();
    const studentUidSet = new Set(userPrivDocs
        .filter((udoc) => isManagedStudent(udoc) && !excludedLegacyUids.has(udoc._id))
        .map((udoc) => udoc._id));
    const studentUids = candidateUids.filter((uid) => studentUidSet.has(uid));
    if (!studentUids.length) return [];
    const membershipsByUid = new Map<number, typeof joined>();
    for (const membership of joined) {
        membershipsByUid.set(membership.uid, [...(membershipsByUid.get(membership.uid) || []), membership]);
    }
    const domainNameById = new Map(allDomains.map((item) => [item.id.toLowerCase(), item.name]));
    const [udict, recentActivity, globalModeDocs] = await Promise.all([
        user.getListForRender('system', studentUids, true),
        record.coll.aggregate<{ _id: number, lastRecordId: ObjectId }>([
            {
                $match: {
                    domainId: { $in: domainIds },
                    uid: { $in: studentUids },
                    pid: { $gt: 0 },
                    contest: { $nin: [record.RECORD_PRETEST, record.RECORD_GENERATE] },
                },
            },
            { $group: { _id: '$uid', lastRecordId: { $max: '$_id' } } },
        ]).toArray(),
        // getListForRender overlays membership fields over user fields. Read
        // this account-wide preference directly so legacy membership data can
        // never shadow it in the student management editor.
        user.getMulti({ _id: { $in: studentUids } }, ['_id', 'cppEditorMode']).toArray(),
    ]);
    const globalModeByUid = new Map(globalModeDocs.map((udoc) => [udoc._id, udoc.cppEditorMode]));
    const lastSubmitAtByUid = new Map(recentActivity.map((row) => [row._id, row.lastRecordId.getTimestamp()]));
    const students = studentUids.map((uid) => {
        const udoc = udict[uid];
        const memberships = membershipsByUid.get(uid) || [];
        const defaultMembership = memberships.find(
            (membership) => membership.domainId.toLowerCase() === `${(udoc as any).defaultDomain || ''}`.toLowerCase(),
        );
        const displayName = defaultMembership?.displayName || memberships[0]?.displayName || udoc.displayName || udoc.uname;
        const loginAt = (udoc as unknown as Pick<HydroUser, 'loginat'>).loginat;
        return {
            ...udoc,
            uid,
            displayName,
            cppEditorMode: resolveManagedStudentCppEditorMode(
                globalModeByUid.get(uid), undefined, false,
            ),
            submitCount: memberships.reduce((sum, membership) => sum + (membership.nSubmit || 0), 0),
            acceptedCount: memberships.reduce((sum, membership) => sum + (membership.nAccept || 0), 0),
            loginAt,
            lastSubmitAt: lastSubmitAtByUid.get(uid) || null,
            domainNames: memberships.map((membership) => domainNameById.get(membership.domainId.toLowerCase()) || membership.domainId),
            searchText: [
                uid, displayName, udoc.uname, udoc.mail, udoc.school, udoc.studentId,
                ...memberships.map((membership) => domainNameById.get(membership.domainId.toLowerCase()) || membership.domainId),
            ]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase(),
        };
    });
    const getTime = (value: Date | null | undefined) => value?.getTime() || 0;
    return students.sort((a, b) => {
        let comparison = 0;
        if (sort === 'login') {
            comparison = getTime(b.loginAt) - getTime(a.loginAt)
                || b.submitCount - a.submitCount
                || a.uid - b.uid;
        } else if (sort === 'practice') {
            comparison = getTime(b.lastSubmitAt) - getTime(a.lastSubmitAt)
                || b.submitCount - a.submitCount
                || a.uid - b.uid;
        } else {
            comparison = b.submitCount - a.submitCount
                || getTime(b.lastSubmitAt) - getTime(a.lastSubmitAt)
                || a.uid - b.uid;
        }
        return direction === 'asc' ? -comparison : comparison;
    });
}

async function getManagedStudent(uid: number, allDomains: ManagedStudentDomain[]) {
    const [membership, target, excludedLegacyUids] = await Promise.all([
        domain.collUser.findOne({ domainId: { $in: allDomains.map((item) => item.id) }, uid, join: true }),
        user.getById('system', uid),
        workspace.getExcludedLegacyUids(),
    ]);
    return membership && target && isManagedStudent(target) && !excludedLegacyUids.has(uid) ? target : null;
}

interface ManagedStudentDomain {
    id: string;
    name: string;
}

async function getManagedDomains(): Promise<ManagedStudentDomain[]> {
    const ddocs = await workspace.getDomains(workspace.LEGACY_WORKSPACE_ID);
    return ddocs.map((ddoc) => ({ id: ddoc._id, name: ddoc.name || ddoc._id }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

async function getManagedStudentDomains(uid: number, allDomains: ManagedStudentDomain[]) {
    const [memberships, userDoc] = await Promise.all([
        domain.collUser.find({ uid, join: true }).project<{ domainId: string }>({ domainId: 1 }).toArray(),
        user.coll.findOne({ _id: uid }, { projection: { defaultDomain: 1 } }),
    ]);
    const joinedDomainIds = new Set(memberships.map((membership) => membership.domainId.toLowerCase()));
    const domains = allDomains.filter((item) => joinedDomainIds.has(item.id.toLowerCase()));
    const storedDefaultDomain = typeof userDoc?.defaultDomain === 'string'
        ? userDoc.defaultDomain.toLowerCase()
        : '';
    // Do not infer a default from the management page's current domain. An
    // inferred checked radio looked saved in the UI, while login correctly had
    // no persisted preference to follow.
    const selectedDefaultDomain = domains.find((item) => item.id.toLowerCase() === storedDefaultDomain)?.id || '';
    return {
        domains,
        selectedDefaultDomain,
    };
}

class SystemUserManagementHandler extends SystemHandler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_ALL);
    }

    @requireSudo
    @param('uid', Types.Int, true)
    @param('saved', Types.Int, true)
    @param('sort', Types.Range(MANAGED_STUDENT_SORTS), true)
    @param('order', Types.Range(MANAGED_STUDENT_SORT_DIRECTIONS), true)
    async get(
        domainId: string, uid = 0, saved = 0, sort: ManagedStudentSort = 'submit',
        order: ManagedStudentSortDirection = 'desc',
    ) {
        const allDomains = await getManagedDomains();
        const students = await getManagedStudents(allDomains, sort, order);
        const selectedStudent = uid ? students.find((student) => student.uid === uid) : null;
        if (uid && !selectedStudent) throw new UserNotFoundError(uid);
        const selectedStudentDomainState = selectedStudent
            ? await getManagedStudentDomains(selectedStudent.uid, allDomains)
            : { domains: [], selectedDefaultDomain: '' };
        this.response.template = 'manage_user_management.html';
        this.response.body = {
            students,
            selectedStudent,
            selectedStudentDomains: selectedStudentDomainState.domains,
            selectedStudentDefaultDomain: selectedStudentDomainState.selectedDefaultDomain,
            allDomains,
            saved,
            sort,
            order,
        };
    }

    @requireSudo
    @param('uname', Types.Username)
    @param('mail', Types.Email, true)
    @param('password', Types.Password)
    @param('verifyPassword', Types.Password)
    @param('displayName', Types.String)
    @param('joinDomain', Types.DomainId)
    @param('school', Types.String, true)
    @param('studentId', Types.String, true)
    @param('sort', Types.Range(MANAGED_STUDENT_SORTS), true)
    @param('order', Types.Range(MANAGED_STUDENT_SORT_DIRECTIONS), true)
    async postAddStudent(
        domainId: string, uname: string, mail: string | undefined, password: string, verifyPassword: string,
        displayName: string, joinDomain: string, school = '', studentId = '', sort: ManagedStudentSort = 'submit',
        order: ManagedStudentSortDirection = 'desc',
    ) {
        if (password !== verifyPassword) throw new VerifyPasswordError();
        const normalizedDisplayName = normalizeManagedStudentText(displayName, 'displayName');
        if (!normalizedDisplayName) throw new ValidationError('displayName');
        const normalizedSchool = normalizeManagedStudentText(school, 'school');
        const normalizedStudentId = normalizeManagedStudentText(studentId, 'studentId');
        const managedDomains = await getManagedDomains();
        const managedDomain = managedDomains.find((item) => item.id.toLowerCase() === joinDomain.toLowerCase());
        const joinTarget = managedDomain ? await domain.get(managedDomain.id) : null;
        if (!joinTarget) throw new ValidationError('joinDomain');
        const accountMail = mail?.trim() || `${randomstring(12)}@invalid.local`;
        const uid = await user.create(accountMail, uname, password);
        await Promise.all([
            domain.setUserInDomain(joinTarget._id, uid, {
                join: true,
                role: 'default',
                displayName: normalizedDisplayName,
            }),
            user.setById(uid, {
                school: normalizedSchool,
                studentId: normalizedStudentId,
                defaultDomain: joinTarget._id,
                cppEditorMode: 'proficient',
            }),
        ]);
        this.response.redirect = this.url('manage_user_management', { query: { uid, saved: 1, sort, order } });
    }

    @requireSudo
    @param('uid', Types.Int)
    @param('password', Types.Password)
    @param('verifyPassword', Types.Password)
    @param('sort', Types.Range(MANAGED_STUDENT_SORTS), true)
    @param('order', Types.Range(MANAGED_STUDENT_SORT_DIRECTIONS), true)
    async postResetPassword(
        domainId: string, uid: number, password: string, verifyPassword: string, sort: ManagedStudentSort = 'submit',
        order: ManagedStudentSortDirection = 'desc',
    ) {
        if (password !== verifyPassword) throw new VerifyPasswordError();
        const target = await getManagedStudent(uid, await getManagedDomains());
        if (!target) throw new UserNotFoundError(uid);
        checkPasswordResetTarget(target);
        await user.setPassword(uid, password);
        await token.delByUid(uid);
        this.response.redirect = this.url('manage_user_management', { query: { uid, saved: 1, sort, order } });
    }

    @requireSudo
    @param('uid', Types.Int)
    @param('uname', Types.Username)
    @param('mail', Types.Email, true)
    @param('displayName', Types.String)
    @param('school', Types.String, true)
    @param('studentId', Types.String, true)
    @param('defaultDomain', Types.String, true)
    @param('cppEditorMode', Types.Range(CPP_EDITOR_MODES))
    @param('sort', Types.Range(MANAGED_STUDENT_SORTS), true)
    @param('order', Types.Range(MANAGED_STUDENT_SORT_DIRECTIONS), true)
    async postEditStudent(
        domainId: string, uid: number, uname: string, mail: string | undefined,
        displayName: string, school = '', studentId = '', defaultDomain = '', cppEditorMode: CppEditorMode = 'proficient',
        sort: ManagedStudentSort = 'submit', order: ManagedStudentSortDirection = 'desc',
    ) {
        const target = await getManagedStudent(uid, await getManagedDomains());
        if (!target) throw new UserNotFoundError(uid);
        const normalizedDisplayName = normalizeManagedStudentText(displayName, 'displayName');
        if (!normalizedDisplayName) throw new ValidationError('displayName');
        const normalizedSchool = normalizeManagedStudentText(school, 'school');
        const normalizedStudentId = normalizeManagedStudentText(studentId, 'studentId');
        const effectiveMail = mail?.trim() || target.mail;
        const domainState = await getManagedStudentDomains(uid, await getManagedDomains());
        const requestedDefaultDomain = normalizeManagedStudentText(defaultDomain, 'defaultDomain');
        const selectedDefaultDomain = domainState.domains.find(
            (item) => item.id.toLowerCase() === (requestedDefaultDomain || domainState.selectedDefaultDomain).toLowerCase(),
        )?.id;
        if (!selectedDefaultDomain) throw new ValidationError('defaultDomain');
        const [sameNameUser, sameMailUser] = await Promise.all([
            uname === target.uname ? null : user.getByUname(domainId, uname),
            effectiveMail === target.mail ? null : user.getByEmail(domainId, effectiveMail),
        ]);
        if (sameNameUser && sameNameUser._id !== uid) throw new UserAlreadyExistError(uname);
        if (sameMailUser && sameMailUser._id !== uid) throw new UserAlreadyExistError(effectiveMail);
        await user.setById(uid, {
            uname,
            unameLower: uname.toLowerCase(),
            mail: effectiveMail,
            mailLower: handleMailLower(effectiveMail),
            school: normalizedSchool,
            studentId: normalizedStudentId,
            defaultDomain: selectedDefaultDomain,
            cppEditorMode,
        });
        await domain.updateUserInDomain(selectedDefaultDomain, uid, {
            $set: { displayName: normalizedDisplayName },
        });
        this.response.redirect = this.url('manage_user_management', { query: { uid, saved: 1, sort, order } });
    }
}

class SystemLotteryHandler extends Handler {
    private domainScoped = false;

    async prepare() {
        this.domainScoped = this.request.path.startsWith('/domain/lottery');
        if (this.domainScoped) {
            this.checkPerm(PERM.PERM_EDIT_DOMAIN);
            if (!this.domain.workspaceId || workspace.resolveDomainWorkspaceId(this.domain) === workspace.LEGACY_WORKSPACE_ID) {
                throw new ValidationError('domainId');
            }
            return;
        }
        const legacyWorkspace = await workspace.getLegacyWorkspace();
        if (legacyWorkspace.ownerUid !== this.user._id) throw new PermissionError(PRIV.PRIV_ALL);
    }

    private get routeName() {
        return this.domainScoped ? 'domain_lottery' : 'manage_lottery';
    }

    private redirect(query: Record<string, any>) {
        this.response.redirect = this.url(this.routeName, { query });
    }

    private async getScopeDomainIds() {
        if (this.domainScoped) return [this.domain._id];
        return (await workspace.getDomains(workspace.LEGACY_WORKSPACE_ID)).map((item) => item._id);
    }

    private async getScopeStudentUids() {
        const domainIds = await this.getScopeDomainIds();
        const uids = domainIds.length
            ? await domain.collUser.distinct('uid', { domainId: { $in: domainIds }, uid: { $gt: 1 }, join: true })
            : [];
        const excluded = this.domainScoped ? new Set<number>() : await workspace.getExcludedLegacyUids();
        const memberUids = this.domainScoped && this.domain.workspaceId
            ? new Set((await workspace.getMembers(this.domain.workspaceId)).map((item) => item.uid))
            : new Set<number>();
        if (!uids.length) return [];
        const accounts = await user.coll.find({ _id: { $in: uids } })
            .project<Pick<HydroUser, '_id' | 'priv'>>({ _id: 1, priv: 1 })
            .toArray();
        return accounts.filter((item) => isManagedStudent(item)
            && !excluded.has(item._id)
            && !memberUids.has(item._id)).map((item) => item._id);
    }

    private async getScopedTarget(domainId: string, q: string) {
        const target = await getManageTargetUser(domainId, q);
        if (!target) return null;
        const allowedUids = await this.getScopeStudentUids();
        return allowedUids.includes(target._id) ? target : null;
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
        const config = getPointLotteryConfig(this.domainScoped ? this.domain : null);
        const target = q.trim() ? await this.getScopedTarget(domainId, q) : null;
        const targetPointState = target ? await ensureGlobalPointLotteryState(target._id) : null;
        const scopeStudentUids = await this.getScopeStudentUids();
        const pointRankField = rankBy === 'current' ? '$currentPoints' : '$totalPoints';
        const pointRankDocs = await pointLotteryUserColl.aggregate([
            {
                $match: {
                    _id: { $in: scopeStudentUids },
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
        const scopeDomainIds = await this.getScopeDomainIds();
        const logs = await this.ctx.db.collection('lottery.draw')
            .find({ domainId: { $in: scopeDomainIds }, deleted: { $ne: true } })
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
            lotteryRoute: this.routeName,
            domainScoped: this.domainScoped,
            lotteryBaseTemplate: this.domainScoped ? 'domain_base.html' : 'manage_base.html',
            lotteryScopeTitle: this.domainScoped ? `${this.domain.name} · 域内学员` : '唐老师 · 所有域学员',
            lotteryScopeNote: this.domainScoped
                ? '奖品、中奖记录和学员积分操作仅作用于当前域。'
                : '这是唐老师专属的全域抽奖，可管理唐老师工作区内所有域的学员。',
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
        if (this.domainScoped) await domain.edit(this.domain._id, { pointLottery: config });
        else await system.set(POINT_LOTTERY_CONFIG_KEY, config);
        this.redirect({ saved: 1 });
    }

    @requireSudo
    @param('q', Types.Content)
    @param('points', Types.Int)
    async postAddPoints(domainId: string, q: string, points: number) {
        if (points <= 0) throw new ValidationError('points');
        const target = await this.getScopedTarget(domainId, q);
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
        this.redirect({ q, added: points });
    }

    @requireSudo
    @param('q', Types.Content)
    @param('points', Types.Int)
    @param('scope', Types.Range(['current', 'total']))
    async postDeductPoints(domainId: string, q: string, points: number, scope: 'current' | 'total') {
        if (points <= 0) throw new ValidationError('points');
        const target = await this.getScopedTarget(domainId, q);
        if (!target) throw new UserNotFoundError(q);
        if (isPasswordResetProtectedTarget(target)) throw new CannotEditSuperAdminError();
        const field = scope === 'current' ? POINT_LOTTERY_POINTS_FIELD : POINT_LOTTERY_TOTAL_POINTS_FIELD;
        const pointState = await ensureGlobalPointLotteryState(target._id);
        const fallback = scope === 'total' ? pointState?.[POINT_LOTTERY_POINTS_FIELD] : 0;
        const current = Math.max(0, Math.floor(+(pointState?.[field] ?? fallback) || 0));
        await pointLotteryUserColl.updateOne({ _id: target._id }, {
            $set: { [field]: Math.max(0, current - points) },
        });
        this.redirect({ q, adjusted: points });
    }

    @requireSudo
    @param('drawId', Types.ObjectId)
    async postDeleteDraw(domainId: string, drawId: ObjectId) {
        const scopeDomainIds = await this.getScopeDomainIds();
        await this.ctx.db.collection('lottery.draw').updateOne(
            { _id: drawId, domainId: { $in: scopeDomainIds } },
            { $set: { deleted: true, deletedAt: new Date(), deletedBy: this.user._id } },
        );
        this.redirect({ deleted: 1 });
    }

    @requireSudo
    async postClearDraws() {
        const scopeDomainIds = await this.getScopeDomainIds();
        await this.ctx.db.collection('lottery.draw').deleteMany({ domainId: { $in: scopeDomainIds } });
        this.redirect({ cleared: 1 });
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
    ctx.Route('manage_training_dashboard', '/manage/training-dashboard', SystemTrainingDashboardHandler);
    ctx.injectUI('ControlPanel', 'manage_training_dashboard', { before: 'manage_script' });
    ctx.Route('manage_script', '/manage/script', SystemScriptHandler);
    ctx.Route('manage_setting', '/manage/setting', SystemSettingHandler);
    ctx.Route('manage_config', '/manage/config', SystemConfigHandler);
    ctx.Route('manage_user_management', '/manage/users', SystemUserManagementHandler);
    ctx.injectUI('ControlPanel', 'manage_user_management', { before: 'manage_user_priv', icon: 'user' }, PRIV.PRIV_ALL);
    ctx.Route('manage_user_import', '/manage/userimport', SystemUserImportHandler);
    ctx.Route('manage_user_priv', '/manage/userpriv', SystemUserPrivHandler);
    ctx.Route('manage_lottery', '/manage/lottery', SystemLotteryHandler);
    ctx.injectUI(
        'ControlPanel', 'manage_lottery', { icon: 'gift' }, PRIV.PRIV_ALL,
        (handler) => workspace.isLegacyOwner(handler.user._id),
    );
    ctx.Route('domain_lottery', '/domain/lottery', SystemLotteryHandler);
    ctx.injectUI(
        'DomainManage', 'domain_lottery',
        { family: 'Properties', icon: 'gift', before: 'domain_edit' },
        PERM.PERM_EDIT_DOMAIN,
        (handler) => !!handler.domain?.workspaceId
            && workspace.resolveDomainWorkspaceId(handler.domain) !== workspace.LEGACY_WORKSPACE_ID,
    );
    ctx.Connection('manage_check', '/manage/check-conn', SystemCheckConnHandler);
}
