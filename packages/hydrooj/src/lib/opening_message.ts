import { randomBytes } from 'crypto';
import { CreateError, PermissionError, UserFacingError, ValidationError } from '../error';
import type { User } from '../interface';
import { PRIV } from '../model/builtin';
import db from '../service/db';
import { isBroadcastStudent } from './broadcast';

export interface OpeningMessageDoc {
    _id: number;
    title: string;
    content: string;
    revision: string;
    enabled: boolean;
    updatedAt: Date;
    updatedBy: number;
}

interface OpeningMessageAcknowledgement {
    _id: string;
    uid: number;
    revision: string;
    acknowledgedAt: Date;
}

declare module '../service/db' {
    interface Collections {
        'student.opening-message': OpeningMessageDoc;
        'student.opening-message.acknowledgement': OpeningMessageAcknowledgement;
    }
}

export const coll = db.collection('student.opening-message');
export const collAcknowledgement = db.collection('student.opening-message.acknowledgement');
export const OPENING_MESSAGE_TITLE_LIMIT = 100;
export const OPENING_MESSAGE_CONTENT_LIMIT = 10000;
const REVISION_PATTERN = /^[a-f0-9]{32}$/;

// eslint-disable-next-line unicorn/throw-new-error
export const OpeningMessageConflictError = CreateError(
    'OpeningMessageConflictError', UserFacingError, '这位学员的开屏消息已被更新，请刷新后再编辑。', 409,
);

function validateUid(uid: number) {
    if (!Number.isSafeInteger(uid) || uid <= 1) throw new ValidationError('uid');
}

function validateRevision(revision: string, allowEmpty = false) {
    if ((!allowEmpty || revision !== '') && !REVISION_PATTERN.test(revision)) throw new ValidationError('revision');
}

export function normalizeOpeningMessage(title: string, content: string, enabled: unknown) {
    if (enabled !== true && enabled !== false && enabled !== '1' && enabled !== '0') throw new ValidationError('enabled');
    if (typeof title !== 'string' || title.length > OPENING_MESSAGE_TITLE_LIMIT) throw new ValidationError('title');
    if (typeof content !== 'string' || content.length > OPENING_MESSAGE_CONTENT_LIMIT) throw new ValidationError('content');
    const normalized = {
        title: title.trim(),
        content: content.replace(/\r\n?/g, '\n').trim(),
        enabled: enabled === true || enabled === '1',
    };
    if (normalized.enabled && !normalized.title) throw new ValidationError('title', null, '请填写弹窗标题');
    if (normalized.enabled && !normalized.content) throw new ValidationError('content', null, '请填写弹窗内容');
    return normalized;
}

/** This content is deliberately plain text; teacher input cannot introduce HTML. */
export function renderOpeningMessageContent(content: string) {
    return content.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]).replace(/\n/g, '<br>');
}

export function getOpeningMessage(uid: number) {
    validateUid(uid);
    return coll.findOne({ _id: uid });
}

/** Management receives the editable source and the current revision's receipt. */
export async function presentOpeningMessage(uid: number) {
    const message = await getOpeningMessage(uid);
    const receipt = message ? await collAcknowledgement.findOne({ _id: `${uid}:${message.revision}` }) : null;
    return {
        title: message?.title || '',
        content: message?.content || '',
        revision: message?.revision || '',
        enabled: message?.enabled || false,
        updatedAt: message?.updatedAt || null,
        acknowledgedAt: receipt?.acknowledgedAt || null,
    };
}

/** Edits have new receipts; unchanged saves and enable toggles retain existing reads. */
export async function updateOpeningMessage(
    uid: number, editorUid: number, title: string, content: string, expectedRevision: string, enabled: unknown,
) {
    validateUid(uid);
    validateRevision(expectedRevision, true);
    const normalized = normalizeOpeningMessage(title, content, enabled);
    const previous = await getOpeningMessage(uid);
    if ((previous?.revision || '') !== expectedRevision) throw new OpeningMessageConflictError();
    const changed = !previous || previous.title !== normalized.title || previous.content !== normalized.content;
    const next: OpeningMessageDoc = {
        _id: uid,
        ...normalized,
        revision: changed ? randomBytes(16).toString('hex') : previous.revision,
        updatedAt: changed || previous.enabled !== normalized.enabled ? new Date() : previous.updatedAt,
        updatedBy: changed || previous.enabled !== normalized.enabled ? editorUid : previous.updatedBy,
    };
    if (!previous) {
        try {
            await coll.insertOne(next);
        } catch (error) {
            if (error.code === 11000) throw new OpeningMessageConflictError();
            throw error;
        }
    } else {
        const result = await coll.updateOne({
            _id: uid, revision: expectedRevision, enabled: previous.enabled, updatedAt: previous.updatedAt,
        }, { $set: next });
        if (!result.matchedCount) throw new OpeningMessageConflictError();
    }
    return presentOpeningMessage(uid);
}

export async function getUnreadOpeningMessage(viewer: User) {
    if (!viewer || viewer._id <= 1 || !viewer.hasPriv(PRIV.PRIV_USER_PROFILE)) return null;
    const message = await getOpeningMessage(viewer._id);
    if (!message?.enabled || !message.title || !message.content || !await isBroadcastStudent(viewer)) return null;
    if (await collAcknowledgement.findOne({ _id: `${viewer._id}:${message.revision}` })) return null;
    return {
        scope: 'student' as const,
        title: message.title,
        content: renderOpeningMessageContent(message.content),
        revision: message.revision,
        updatedAt: message.updatedAt,
    };
}

/** Immutable acknowledgements never allow an old tab to dismiss a later edit. */
export async function acknowledgeOpeningMessage(viewer: User, revision: string) {
    validateRevision(revision);
    if (!await isBroadcastStudent(viewer)) throw new PermissionError(PRIV.PRIV_USER_PROFILE);
    if (!await getOpeningMessage(viewer._id)) throw new ValidationError('revision');
    const _id = `${viewer._id}:${revision}`;
    try {
        await collAcknowledgement.updateOne({ _id }, {
            $setOnInsert: { _id, uid: viewer._id, revision, acknowledgedAt: new Date() },
        }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
}

export async function ensureOpeningMessageIndexes() {
    await db.ensureIndexes(collAcknowledgement, { key: { uid: 1, revision: 1 }, name: 'user_revision', unique: true });
}
