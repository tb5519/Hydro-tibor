import { randomBytes } from 'crypto';
import { CreateError, PermissionError, UserFacingError, ValidationError } from '../error';
import type { DomainDoc, User } from '../interface';
import { PERM, PRIV } from '../model/builtin';
import domain from '../model/domain';
import workspace from '../model/workspace';
import db from '../service/db';

export type BroadcastScope = 'global' | 'domain';

export interface BroadcastDoc {
    _id: string;
    scope: BroadcastScope;
    domainId: string;
    title: string;
    content: string;
    revision: string;
    enabled: boolean;
    updatedAt: Date;
    updatedBy: number;
}

interface BroadcastAcknowledgement {
    _id: string;
    uid: number;
    broadcastId: string;
    revision: string;
    acknowledgedAt: Date;
}

declare module '../service/db' {
    interface Collections {
        broadcast: BroadcastDoc;
        'broadcast.acknowledgement': BroadcastAcknowledgement;
    }
}

export const coll = db.collection('broadcast');
export const collAcknowledgement = db.collection('broadcast.acknowledgement');
const TITLE_LIMIT = 100;
const CONTENT_LIMIT = 100000;
const REVISION_PATTERN = /^[a-f0-9]{32}$/;
const ACKNOWLEDGEMENT_PAGE_SIZE = 20;

// eslint-disable-next-line unicorn/throw-new-error
export const BroadcastConflictError = CreateError(
    'BroadcastConflictError', UserFacingError, '广播已被其他老师更新，请刷新页面后再试。', 409,
);

// The UI owns its HTML parser dependency. Never accept or display unfiltered HTML
// if a UI plugin has not installed a sanitizer yet.
let sanitizeHtml: ((html: string) => string) | undefined;
export function configureBroadcastSanitizer(sanitizer: (html: string) => string) {
    sanitizeHtml = sanitizer;
    return () => {
        if (sanitizeHtml === sanitizer) sanitizeHtml = undefined;
    };
}

export function sanitizeBroadcastContent(content: string) {
    if (typeof content !== 'string' || content.length > CONTENT_LIMIT) throw new ValidationError('content');
    if (!sanitizeHtml) throw new Error('Broadcast HTML sanitizer is unavailable');
    return sanitizeHtml(content).trim();
}

export function normalizeBroadcast(title: string, content: string) {
    if (typeof title !== 'string') throw new ValidationError('title');
    const normalizedTitle = title.trim().replace(/\s+/g, ' ');
    if (!normalizedTitle || normalizedTitle.length > TITLE_LIMIT) throw new ValidationError('title');
    const normalizedContent = sanitizeBroadcastContent(content);
    const textContent = normalizedContent.replace(/<[^>]*>/g, '')
        .replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ').trim();
    if (!textContent && !/<img\s[^>]*\bsrc="[^"]+"/i.test(normalizedContent)) throw new ValidationError('content');
    return { title: normalizedTitle, content: normalizedContent };
}

export function getBroadcastId(scope: BroadcastScope, domainId: string) {
    if (scope !== 'global' && scope !== 'domain') throw new ValidationError('scope');
    if (scope === 'domain' && !domainId) throw new ValidationError('domainId');
    return scope === 'global' ? 'global' : `domain:${domainId}`;
}

export function getBroadcast(scope: BroadcastScope, domainId: string) {
    return coll.findOne({ _id: getBroadcastId(scope, domainId) });
}

export async function assertCanManageBroadcast(viewer: User, scope: BroadcastScope) {
    if (scope === 'global') {
        if ((await workspace.getLegacyWorkspace()).ownerUid !== viewer._id) throw new PermissionError(PRIV.PRIV_ALL);
    } else if (!viewer.hasPerm(PERM.PERM_EDIT_DOMAIN)) throw new PermissionError(PERM.PERM_EDIT_DOMAIN);
}

function validateExpectedRevision(revision: string) {
    if (revision !== '' && !REVISION_PATTERN.test(revision)) throw new ValidationError('revision');
}

/** Compare and swap prevents two editors from silently overwriting each other. */
export async function publishBroadcast(
    scope: BroadcastScope, domainId: string, uid: number, title: string, content: string, expectedRevision: string,
) {
    validateExpectedRevision(expectedRevision);
    const normalized = normalizeBroadcast(title, content);
    const _id = getBroadcastId(scope, domainId);
    const previous = await coll.findOne({ _id });
    if ((previous?.revision || '') !== expectedRevision) throw new BroadcastConflictError();
    const changed = !previous || previous.title !== normalized.title || previous.content !== normalized.content;
    const next: BroadcastDoc = {
        _id,
        scope,
        domainId: scope === 'domain' ? domainId : '',
        ...normalized,
        // Reopening an unchanged announcement must respect existing reads.
        revision: changed ? randomBytes(16).toString('hex') : previous.revision,
        enabled: true,
        updatedAt: changed ? new Date() : previous.updatedAt,
        updatedBy: changed ? uid : previous.updatedBy,
    };
    if (!previous) {
        try {
            await coll.insertOne(next);
        } catch (error) {
            if (error.code === 11000) throw new BroadcastConflictError();
            throw error;
        }
    } else {
        const result = await coll.updateOne({ _id, revision: expectedRevision }, { $set: next });
        if (!result.matchedCount) throw new BroadcastConflictError();
    }
    return next;
}

export async function disableBroadcast(scope: BroadcastScope, domainId: string, expectedRevision: string) {
    validateExpectedRevision(expectedRevision);
    const previous = await getBroadcast(scope, domainId);
    if (!previous || previous.revision !== expectedRevision) throw new BroadcastConflictError();
    const result = await coll.updateOne({ _id: previous._id, revision: expectedRevision }, { $set: { enabled: false } });
    if (!result.matchedCount) throw new BroadcastConflictError();
    return { ...previous, enabled: false };
}

export function presentBroadcast(broadcast: BroadcastDoc) {
    return {
        title: broadcast.title,
        content: sanitizeBroadcastContent(broadcast.content),
        revision: broadcast.revision,
        enabled: broadcast.enabled,
        updatedAt: broadcast.updatedAt,
    };
}

export async function isBroadcastStudent(viewer: User) {
    if (!viewer || viewer._id <= 1 || !viewer.hasPriv(PRIV.PRIV_USER_PROFILE)
        || viewer.hasPriv(PRIV.PRIV_EDIT_SYSTEM) || viewer.hasPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN)
        || viewer.hasPriv(PRIV.PRIV_JUDGE) || viewer.hasPerm(PERM.PERM_EDIT_DOMAIN)
        || workspace.isPlatformAdmin(viewer._id)) return false;
    const [ownedDomain, teacherMembership, domainAdministrator] = await Promise.all([
        domain.coll.findOne({ owner: viewer._id }, { projection: { _id: 1 } }),
        workspace.collMember.findOne({ uid: viewer._id, status: 'active' }, { projection: { _id: 1 } }),
        domain.collUser.findOne({ uid: viewer._id, join: true, role: 'root' }, { projection: { _id: 1 } }),
    ]);
    return !ownedDomain && !teacherMembership && !domainAdministrator;
}

export async function getUnreadBroadcasts(viewer: User, ddoc: DomainDoc) {
    if (!viewer || viewer._id <= 1 || !viewer.hasPriv(PRIV.PRIV_USER_PROFILE)) return [];
    const ids = ['global', getBroadcastId('domain', ddoc._id)];
    const candidates = await coll.find({ _id: { $in: ids }, enabled: true }).toArray();
    if (!candidates.length) return [];
    const [isStudent, membership] = await Promise.all([
        isBroadcastStudent(viewer),
        candidates.some((item) => item.scope === 'domain')
            ? domain.collUser.findOne({ domainId: ddoc._id, uid: viewer._id, join: true }) : null,
    ]);
    if (!isStudent) return [];
    const broadcasts = candidates.filter((item) => item.scope === 'global' || membership);
    if (!broadcasts.length) return [];
    const acknowledgements = await collAcknowledgement.find({
        _id: { $in: broadcasts.map((item) => `${viewer._id}:${item._id}:${item.revision}`) },
    }).toArray();
    const seen = new Set(acknowledgements.map((item) => `${item.broadcastId}:${item.revision}`));
    return broadcasts.filter((item) => !seen.has(`${item._id}:${item.revision}`))
        .sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'global' ? -1 : 1))
        .map((item) => ({
            ...presentBroadcast(item),
            scope: item.scope,
            domainId: ddoc._id,
            scopeLabel: item.scope === 'global' ? '全域广播' : `${ddoc.name || ddoc._id} · 域广播`,
        }));
}

/** Immutable receipts keep an old browser tab from marking a newer revision read. */
export async function acknowledgeBroadcast(viewer: User, ddoc: DomainDoc, scope: BroadcastScope, revision: string) {
    if (!REVISION_PATTERN.test(revision)) throw new ValidationError('revision');
    if (!await isBroadcastStudent(viewer)) throw new PermissionError(PRIV.PRIV_USER_PROFILE);
    const broadcastId = getBroadcastId(scope, ddoc._id);
    if (scope === 'domain' && !await domain.collUser.findOne({ domainId: ddoc._id, uid: viewer._id, join: true })) {
        throw new PermissionError(PERM.PERM_VIEW);
    }
    if (!await getBroadcast(scope, ddoc._id)) throw new ValidationError('scope');
    const _id = `${viewer._id}:${broadcastId}:${revision}`;
    // An older, already displayed revision remains acknowledgeable after edits.
    // Its receipt cannot suppress the newly published revision.
    try {
        await collAcknowledgement.updateOne({ _id }, {
            $setOnInsert: { _id, uid: viewer._id, broadcastId, revision, acknowledgedAt: new Date() },
        }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
}

/** Only the current publication is reportable; old revisions never inflate its count. */
export async function getBroadcastAcknowledgements(
    scope: BroadcastScope, domainId: string, expectedRevision: string, requestedPage = 1,
) {
    validateExpectedRevision(expectedRevision);
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new ValidationError('page');
    const broadcast = await getBroadcast(scope, domainId);
    if ((broadcast?.revision || '') !== expectedRevision) throw new BroadcastConflictError();
    const query = { broadcastId: getBroadcastId(scope, domainId), revision: expectedRevision };
    const total = broadcast ? await collAcknowledgement.countDocuments(query) : 0;
    const pages = Math.max(1, Math.ceil(total / ACKNOWLEDGEMENT_PAGE_SIZE));
    const page = Math.min(requestedPage, pages);
    const rows = total ? await collAcknowledgement.find(query).sort({ acknowledgedAt: -1, _id: -1 })
        .skip((page - 1) * ACKNOWLEDGEMENT_PAGE_SIZE).limit(ACKNOWLEDGEMENT_PAGE_SIZE).toArray() : [];
    return { revision: expectedRevision, total, page, pages, rows };
}

export async function ensureBroadcastIndexes() {
    await Promise.all([
        db.ensureIndexes(coll, { key: { enabled: 1 }, name: 'enabled' }),
        db.ensureIndexes(collAcknowledgement, { key: { uid: 1, broadcastId: 1 }, name: 'user_broadcast' }),
        db.ensureIndexes(collAcknowledgement, {
            key: { broadcastId: 1, revision: 1, acknowledgedAt: -1, _id: -1 }, name: 'broadcast_revision_time',
        }),
    ]);
}
