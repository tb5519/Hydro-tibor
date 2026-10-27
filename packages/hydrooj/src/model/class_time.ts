/* eslint-disable no-control-regex -- External identifiers and labels must reject control characters. */
import { createHash, randomBytes } from 'crypto';
import moment from 'moment-timezone';
import type { Context } from '../context';
import { CreateError, PermissionError, UserFacingError, ValidationError } from '../error';
import type { DomainDoc } from '../interface';
import { isScratchDomain } from '../lib/domain_type';
import { trainingDay } from '../lib/training_time';
import db from '../service/db';
import type { Handler } from '../service/server';
import { PERM, PRIV } from './builtin';
import domain from './domain';
import user from './user';
import workspace from './workspace';

export const ClassTimeTokenError = CreateError('ClassTimeTokenError', UserFacingError, '课时同步令牌无效、已过期或已撤销。', 401);
export const ClassTimeScopeError = CreateError('ClassTimeScopeError', UserFacingError, '令牌无权同步该课堂或学员的课时。', 403);
export const ClassTimeConflictError = CreateError('ClassTimeConflictError', UserFacingError, 'externalId 已存在且课时内容不同，请使用原内容重试。', 409);

export interface ClassTimeScope {
    workspaceId: string;
    domains: { id: string, name?: string, owner?: number }[];
}
interface ClassTimeToken {
    _id: string; teacherUid: number; workspaceId: string; domainIds: string[];
    hash?: string; prefix: string; createdAt: Date; expiresAt: Date; revokedAt?: Date;
}
export interface ClassTime {
    _id: string; workspaceId: string; teacherUid: number; domainId: string; uid: number;
    externalId: string; startAt: Date; endAt: Date; day: string; durationSeconds: number;
    title: string; fingerprint: string; createdAt: Date;
}
declare module '../service/db' {
    interface Collections {
        'training.class.token': ClassTimeToken;
        'training.class': ClassTime;
    }
}

export const tokens = db.collection('training.class.token');
export const classes = db.collection('training.class');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const tokenId = (uid: number, workspaceId: string) => JSON.stringify([workspaceId, uid]);
const TOKEN_MS = 365 * 86400_000;

function publicStatus(token: ClassTimeToken | null, now: Date) {
    return {
        active: !!token?.hash && !token.revokedAt && +token.expiresAt > +now,
        domainIds: token?.domainIds || [], prefix: token?.prefix || '',
        createdAt: token?.createdAt || null, expiresAt: token?.expiresAt || null, revokedAt: token?.revokedAt || null,
    };
}

export async function tokenStatus(teacherUid: number, workspaceId: string, now = new Date()) {
    return publicStatus(await tokens.findOne({ _id: tokenId(teacherUid, workspaceId) }), now);
}

async function currentScope(teacherUid: number, workspaceId: string, targetDomain: DomainDoc) {
    const wdoc = await workspace.get(workspaceId);
    if (!wdoc || wdoc.status !== 'active' || !targetDomain || isScratchDomain(targetDomain)
        || workspace.resolveDomainWorkspaceId(targetDomain) !== workspaceId) throw new ClassTimeScopeError();
    if (workspace.isEnabled() && !workspace.isPlatformAdmin(teacherUid)) {
        const assigned = await workspace.getAssignedWorkspaceIds(teacherUid);
        if (assigned.length ? !assigned.includes(workspaceId) : workspaceId !== workspace.LEGACY_WORKSPACE_ID) {
            throw new ClassTimeScopeError();
        }
    }
    const teacher = await user.getById(targetDomain._id, teacherUid);
    // Full administrators also have the judge bit; exclude dedicated judge accounts only.
    if (!teacher || teacher._id !== teacherUid || !teacher.hasPriv(PRIV.PRIV_USER_PROFILE)
        || (teacher.hasPriv(PRIV.PRIV_JUDGE) && !teacher.hasPriv(PRIV.PRIV_EDIT_SYSTEM))) throw new ClassTimeScopeError();
    // Load lazily: the dashboard imports this independent class-time ledger.
    const { trainingDashboardScope } = require('./training_dashboard') as typeof import('./training_dashboard');
    try {
        return await trainingDashboardScope({ domain: targetDomain, user: teacher, session: {} } as Handler);
    } catch (error) {
        if (error instanceof PermissionError) throw new ClassTimeScopeError();
        throw error;
    }
}

/** Only the one-time result contains a secret; persistence and status are hash-only. */
export async function issueToken(scope: ClassTimeScope, teacherUid: number, now = new Date()) {
    if (!Number.isSafeInteger(teacherUid) || teacherUid <= 1 || !scope?.workspaceId
        || !Array.isArray(scope.domains) || !scope.domains.length || scope.domains.length > 1000
        || scope.domains.some((item) => typeof item?.id !== 'string' || !item.id)) throw new ValidationError('domains');
    const domainIds = [...new Set(scope.domains.map((item) => item.id))].sort();
    const actualDomain = await domain.get(domainIds[0]);
    const allowed = await currentScope(teacherUid, scope.workspaceId, actualDomain);
    if (domainIds.some((id) => !allowed.domains.some((item) => item.id === id))) throw new ClassTimeScopeError();
    const secret = `ct_${randomBytes(32).toString('hex')}`;
    const token: ClassTimeToken = {
        _id: tokenId(teacherUid, scope.workspaceId), teacherUid, workspaceId: scope.workspaceId,
        domainIds, hash: hash(secret), prefix: secret.slice(0, 11),
        createdAt: now, expiresAt: new Date(+now + TOKEN_MS),
    };
    await tokens.replaceOne({ _id: token._id }, token, { upsert: true });
    return { token: secret, status: publicStatus(token, now) };
}

export async function revokeToken(teacherUid: number, workspaceId: string, now = new Date()) {
    await tokens.updateOne({ _id: tokenId(teacherUid, workspaceId) }, { $unset: { hash: '' }, $set: { revokedAt: now } });
    return tokenStatus(teacherUid, workspaceId, now);
}

function normalizedPayload(payload: unknown, now: Date) {
    const keys = ['externalId', 'domainId', 'uid', 'startAt', 'durationHours', 'title'];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || Object.keys(payload).some((key) => !keys.includes(key))) throw new ValidationError('classTime');
    const value = payload as Record<string, unknown>;
    if (typeof value.externalId !== 'string' || !value.externalId.trim() || value.externalId.length > 128
        || /[\x00-\x1f\x7f]/.test(value.externalId)) throw new ValidationError('externalId');
    if (typeof value.domainId !== 'string' || !value.domainId || value.domainId.length > 128) throw new ValidationError('domainId');
    if (!Number.isSafeInteger(value.uid) || (value.uid as number) <= 1) throw new ValidationError('uid');
    if (typeof value.startAt !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value.startAt)) {
        throw new ValidationError('startAt', null, '请提供包含时区的 ISO 8601 时间。');
    }
    const parsed = moment.parseZone(value.startAt, moment.ISO_8601, true);
    if (!parsed.isValid()) throw new ValidationError('startAt');
    if (typeof value.durationHours !== 'number' || !Number.isFinite(value.durationHours)
        || value.durationHours <= 0 || value.durationHours > 24) throw new ValidationError('durationHours');
    const milliseconds = Math.round(value.durationHours * 3600_000);
    if (!milliseconds) throw new ValidationError('durationHours');
    const startAt = parsed.toDate();
    const endAt = new Date(+startAt + milliseconds);
    if (+endAt > +now) throw new ValidationError('startAt', null, '只能同步已经结束的课程。');
    if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 200
        || /[\x00-\x1f\x7f]/.test(value.title))) throw new ValidationError('title');
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    const domainId = value.domainId;
    const uid = value.uid as number;
    return { externalId: value.externalId.trim(), domainId, uid, startAt, endAt, title,
        day: trainingDay(startAt), durationSeconds: milliseconds / 1000,
        fingerprint: hash(JSON.stringify([domainId, uid, startAt.toISOString(), milliseconds, title])) };
}

async function ensureStudent(scope: ClassTimeScope, domainId: string, uid: number) {
    const [membership, members, student, excluded] = await Promise.all([
        domain.collUser.findOne({ domainId, uid, join: true, blockedByStudentManagement: { $ne: true } }),
        workspace.getMembers(scope.workspaceId), user.getById(domainId, uid),
        scope.workspaceId === workspace.LEGACY_WORKSPACE_ID ? workspace.getExcludedLegacyUids() : Promise.resolve(new Set<number>()),
    ]);
    const teachers = new Set([...members.map((item) => item.uid), ...scope.domains.map((item) => item.owner)]);
    if (!membership || !student || student._id !== uid || teachers.has(uid) || excluded.has(uid)
        || !student.hasPriv(PRIV.PRIV_USER_PROFILE) || student.hasPriv(PRIV.PRIV_EDIT_SYSTEM) || student.hasPriv(PRIV.PRIV_JUDGE)
        || !student.hasPerm(PERM.PERM_VIEW) || student.hasPerm(PERM.PERM_EDIT_DOMAIN)) throw new ClassTimeScopeError();
}

export async function ingest(secret: unknown, payload: unknown, requestDomain?: DomainDoc, now = new Date()) {
    if (typeof secret !== 'string' || !/^ct_[a-f0-9]{64}$/.test(secret)) throw new ClassTimeTokenError();
    const token = await tokens.findOne({ hash: hash(secret), expiresAt: { $gt: now }, revokedAt: { $exists: false } });
    if (!token) throw new ClassTimeTokenError();
    const normalized = normalizedPayload(payload, now);
    if (!token.domainIds.includes(normalized.domainId)) throw new ClassTimeScopeError();
    const targetDomain = await domain.get(normalized.domainId);
    if (requestDomain && requestDomain._id !== 'system'
        && workspace.resolveDomainWorkspaceId(requestDomain) !== token.workspaceId) throw new ClassTimeScopeError();
    const scope = await currentScope(token.teacherUid, token.workspaceId, targetDomain);
    if (!scope.domains.some((item) => item.id === normalized.domainId)) throw new ClassTimeScopeError();
    await ensureStudent(scope, normalized.domainId, normalized.uid);
    const row: ClassTime = {
        _id: hash(JSON.stringify([token.workspaceId, normalized.externalId])),
        workspaceId: token.workspaceId, teacherUid: token.teacherUid, ...normalized, createdAt: now,
    };
    let duplicate = false;
    try { await classes.insertOne(row); } catch (error) {
        if (error.code !== 11000) throw error;
        const existing = await classes.findOne({ _id: row._id });
        if (!existing || existing.fingerprint !== row.fingerprint) throw new ClassTimeConflictError();
        duplicate = true;
    }
    return { accepted: true, duplicate, externalId: row.externalId, domainId: row.domainId, uid: row.uid,
        startAt: row.startAt.toISOString(), endAt: row.endAt.toISOString(), durationHours: row.durationSeconds / 3600 };
}

export async function apply(ctx: Context) {
    await Promise.all([
        ctx.db.ensureIndexes(tokens, { key: { hash: 1 }, name: 'class_token_hash', unique: true, sparse: true }),
        ctx.db.ensureIndexes(classes,
            { key: { workspaceId: 1, externalId: 1 }, name: 'class_external_id', unique: true },
            { key: { domainId: 1, day: 1, uid: 1 }, name: 'class_domain_day' },
            { key: { workspaceId: 1, uid: 1, startAt: 1 }, name: 'class_student_history' }),
    ]);
}
