/* eslint-disable no-await-in-loop */
import { randomBytes } from 'crypto';
import { open, stat } from 'fs/promises';
import { ObjectId } from 'mongodb';
import type { Context } from '../context';
import avatar from '../lib/avatar';
import {
    CHAT_FILE_BYTES, CHAT_IMAGE_BYTES, CHAT_PAGE_SIZE, CHAT_QUOTA_BYTES, ClassChatError,
    chatFilename, chatImageMime, chatPreview, rewriteChatProblemMedia, validateChatSend,
} from '../lib/class_chat';
import bus from '../service/bus';
import db from '../service/db';
import { BUILTIN_ROLES, PERM, PRIV } from './builtin';
import domain from './domain';
import * as share from './live_share';
import problem from './problem';
import storage from './storage';
import user, { coll as users } from './user';
import workspace from './workspace';

export interface ChatSnapshot {
    title: string; content: string; html: boolean; pid: number; domainId: string; lang: string; code: string;
    media?: { name: string, path: string, etag: string, size: number, mime: string }[];
}
export interface ChatAttachment { id: string, name: string, size: number, mime: string }
export interface ChatMessage {
    _id: ObjectId; conversation: string; seq: number; from: number; to: number; clientId: string;
    kind: 'text' | 'file' | 'image' | 'snapshot'; text: string; createdAt: Date; bytes: number;
    attachment?: ChatAttachment; snapshot?: ChatSnapshot; removed?: boolean;
}
interface ChatConversation {
    _id: string; workspaceId: string; teacherUid: number; studentUid: number; domainId: string;
    seq: number; read: Record<string, number>; lock?: string; lockedUntil?: Date;
}
interface ChatAsset {
    _id: string; conversation: string; path: string; messageId: ObjectId;
    createdAt: Date; checkAfter: Date;
}
interface ChatGrant { _id: string; uid: number; domainId: string; pid: number; expiresAt: Date }
interface ChatPresence { _id: string; uid: number; workspaceId: string; domainId: string; expiresAt: Date }
export interface ChatEvent { uid: number; peerUid: number }
declare module '../service/db' {
    interface Collections {
        'class.chat.message': ChatMessage;
        'class.chat.conversation': ChatConversation;
        'class.chat.asset': ChatAsset;
        'class.chat.grant': ChatGrant;
        'class.chat.presence': ChatPresence;
    }
}
declare module '../service/bus' {
    interface EventMap {
        'class-chat/changed': (event: ChatEvent) => void;
        'class-chat/presence': (event: { workspaceId: string }) => void;
    }
}

export const messages = db.collection('class.chat.message');
export const conversations = db.collection('class.chat.conversation');
export const assets = db.collection('class.chat.asset');
export const grants = db.collection('class.chat.grant');
export const presence = db.collection('class.chat.presence');
export const CHAT_PRESENCE_MS = 75_000;
const opaqueId = () => randomBytes(24).toString('hex');
const nameOf = (account: any) => String(account.displayName || account.uname || account._id).slice(0, 80);
const publicAccount = (account: any) => ({ uid: account._id, name: nameOf(account), avatarUrl: avatar(account.avatar || '', 80) });

export async function connectPresence(uid: number, domainId: string, now = Date.now()) {
    const scope = await scopeFor(uid, domainId);
    if (scope.canTeach) return null;
    const item: ChatPresence = { _id: opaqueId(), uid, domainId, workspaceId: scope.workspaceId, expiresAt: new Date(now + CHAT_PRESENCE_MS) };
    await presence.insertOne(item);
    bus.broadcast('class-chat/presence', { workspaceId: item.workspaceId });
    return item;
}

export async function pulsePresence(item: ChatPresence, now = Date.now()) {
    const scope = await scopeFor(item.uid, item.domainId);
    if (scope.canTeach || scope.workspaceId !== item.workspaceId) throw new ClassChatError('FORBIDDEN', '账号角色已改变，请刷新页面。', 403);
    const previous = await presence.findOneAndUpdate({ _id: item._id, uid: item.uid },
        { $set: { expiresAt: new Date(now + CHAT_PRESENCE_MS) } });
    if (!previous) {
        await presence.insertOne({ ...item, expiresAt: new Date(now + CHAT_PRESENCE_MS) });
        bus.broadcast('class-chat/presence', { workspaceId: item.workspaceId });
    } else if (+previous.expiresAt <= now) bus.broadcast('class-chat/presence', { workspaceId: item.workspaceId });
}

export async function disconnectPresence(item: ChatPresence) {
    if (!item) return;
    await presence.deleteOne({ _id: item._id, uid: item.uid });
    bus.broadcast('class-chat/presence', { workspaceId: item.workspaceId });
}

export async function expirePresence(now = Date.now()) {
    const workspaces = await presence.distinct('workspaceId', { expiresAt: { $lte: new Date(now) } });
    await presence.deleteMany({ expiresAt: { $lte: new Date(now) } });
    for (const workspaceId of workspaces) bus.broadcast('class-chat/presence', { workspaceId });
}

export async function scopeFor(uid: number, domainId: string) {
    try { return { ...await share.teacherScope(uid, domainId), canTeach: true }; }
    catch { return { ...await share.studentScope(uid, domainId), canTeach: false }; }
}

export async function resolveScope(uid: number, preferredDomain: string) {
    try { return await scopeFor(uid, preferredDomain); } catch { /* Account pages may use the system domain. */ }
    const joinedIds = await domain.collUser.distinct('domainId', { uid, join: true, blockedByStudentManagement: { $ne: true } });
    for (const id of joinedIds) {
        try { return await scopeFor(uid, id); } catch { /* Only expose a valid teaching relationship. */ }
    }
    throw new ClassChatError('FORBIDDEN', '当前账号没有可用的师生聊天。', 403);
}

export async function authorizePair(uid: number, peerUid: number, domainId: string) {
    const current = await scopeFor(uid, domainId);
    const teacherUid = current.canTeach ? uid : peerUid;
    const studentUid = current.canTeach ? peerUid : uid;
    const pair = await share.authorizePair(teacherUid, studentUid, domainId);
    const workspaceId = pair.teacher.workspaceId;
    const id = `${workspaceId}:${teacherUid}:${studentUid}`;
    const peerAccount = current.canTeach ? pair.student.account : pair.teacher.account;
    const peer = await users.findOne({ _id: peerAccount._id }, { projection: { _id: 1, uname: 1, displayName: 1, avatar: 1 } });
    return { id, teacherUid, studentUid, workspaceId, domainId, canTeach: current.canTeach, peer: publicAccount(peer) };
}
export type ChatPair = Awaited<ReturnType<typeof authorizePair>>;

const rosterCache = new Map<string, { until: number, pending: Promise<ChatPair[]> }>();
export function clearRosterCache() { rosterCache.clear(); }

async function discoverPeers(uid: number, scope: Awaited<ReturnType<typeof resolveScope>>) {
    const classrooms = await workspace.getDomains(scope.workspaceId);
    const candidates = new Map<number, string[]>();
    if (scope.canTeach) {
        for (const classroom of classrooms) {
            try { await share.teacherScope(uid, classroom._id); } catch { continue; }
            const memberships = await domain.collUser.find({ domainId: classroom._id, uid: { $gt: 1, $ne: uid },
                join: true, blockedByStudentManagement: { $ne: true } }).project({ uid: 1 }).limit(2000).toArray();
            for (const item of memberships) candidates.set(item.uid, [...candidates.get(item.uid) || [], classroom._id]);
        }
    } else {
        const members = await workspace.getMembers(scope.workspaceId);
        for (const classroom of classrooms) {
            try { await share.studentScope(uid, classroom._id); } catch { continue; }
            const legacy = scope.workspaceId === workspace.LEGACY_WORKSPACE_ID
                ? await users.find({ priv: { $bitsAllSet: PRIV.PRIV_EDIT_SYSTEM } }).project({ _id: 1 }).toArray() : [];
            const classroomMembers = await domain.collUser.find({ domainId: classroom._id, join: true,
                role: { $ne: 'default' }, blockedByStudentManagement: { $ne: true } }).project({ uid: 1 }).toArray();
            for (const peerUid of new Set([classroom.owner, ...members.map((m) => m.uid), ...legacy.map((m) => m._id),
                ...classroomMembers.map((m) => m.uid)])) {
                if (peerUid > 1 && peerUid !== uid) candidates.set(peerUid, [...candidates.get(peerUid) || [], classroom._id]);
            }
        }
    }
    const peers = [];
    for (const [peerUid, domainIds] of candidates) {
        let pair: ChatPair;
        for (const id of domainIds) {
            try { pair = await authorizePair(uid, peerUid, id); break; } catch { /* Staff and removed accounts are filtered here. */ }
        }
        if (!pair) continue;
        peers.push(pair);
    }
    return peers;
}

/** Batched equivalent of studentScope, followed by fresh teacherScope for each classroom.
 * Never use cached identities to authorize message previews after a learner is removed.
 */
async function refreshPeers(uid: number, scope: Awaited<ReturnType<typeof resolveScope>>, cached: ChatPair[]) {
    if (!scope.canTeach) {
        return (await Promise.all(cached.map(async (pair) => {
            try { return await authorizePair(uid, pair.peer.uid, pair.domainId); } catch { return null; }
        }))).filter(Boolean);
    }
    const classrooms = await workspace.getDomains(scope.workspaceId);
    const allowed = (await Promise.all(classrooms.map(async (classroom) => {
        try { return (await share.teacherScope(uid, classroom._id)).classroom; } catch { return null; }
    }))).filter(Boolean);
    const uids = cached.map((pair) => pair.peer.uid);
    const [accounts, staff, disabled, memberships, excluded] = await Promise.all([
        users.find({ _id: { $in: uids } }).project({ _id: 1, uname: 1, displayName: 1, avatar: 1, priv: 1 }).toArray(),
        workspace.getMembers(scope.workspaceId),
        workspace.collStudent.distinct('uid', { workspaceId: scope.workspaceId, status: 'disabled' }),
        domain.collUser.find({ domainId: { $in: allowed.map((item) => item._id) }, uid: { $in: uids },
            join: true, blockedByStudentManagement: { $ne: true } }).project({ uid: 1, domainId: 1, role: 1 }).toArray(),
        scope.workspaceId === workspace.LEGACY_WORKSPACE_ID ? workspace.getExcludedLegacyUids() : Promise.resolve(new Set<number>()),
    ]);
    const forbidden = new Set([...staff.map((member) => member.uid), ...disabled, ...excluded]);
    const result: ChatPair[] = [];
    for (const pair of cached) {
        const account = accounts.find((item) => item._id === pair.peer.uid);
        if (!account || forbidden.has(account._id) || !(account.priv & PRIV.PRIV_USER_PROFILE)
            || (account.priv & PRIV.PRIV_EDIT_SYSTEM) || (account.priv & PRIV.PRIV_JUDGE)) continue;
        const classroomMembership = memberships.find((membership) => {
            if (membership.uid !== account._id) return false;
            const classroom = allowed.find((item) => item._id === membership.domainId);
            const role = account.priv & PRIV.PRIV_MANAGE_ALL_DOMAIN ? 'root' : membership.role || 'default';
            const permissions = BigInt(classroom?.roles?.[role] ?? BUILTIN_ROLES[role] ?? 0);
            return (permissions & PERM.PERM_VIEW) === PERM.PERM_VIEW && !(permissions & PERM.PERM_EDIT_DOMAIN);
        });
        if (classroomMembership) result.push({ ...pair, domainId: classroomMembership.domainId, peer: publicAccount(account) });
    }
    return result;
}

export async function peersFor(uid: number, domainId: string) {
    const scope = await resolveScope(uid, domainId);
    const key = `${uid}:${scope.workspaceId}:${scope.canTeach}`;
    let cached = rosterCache.get(key);
    if (!cached || cached.until <= Date.now()) {
        if (rosterCache.size >= 200) rosterCache.delete(rosterCache.keys().next().value);
        cached = { until: Date.now() + 15_000, pending: discoverPeers(uid, scope) };
        rosterCache.set(key, cached);
    }
    // Only identities are briefly cached. All message reads, attachments, sends and snapshots reauthorize fresh membership.
    let pairs: ChatPair[];
    try { pairs = await refreshPeers(uid, scope, await cached.pending); } catch (error) { rosterCache.delete(key); throw error; }
    const ids = pairs.map((pair) => pair.id);
    const conversationsById = new Map((await conversations.find({ _id: { $in: ids } }).toArray()).map((item) => [item._id, item]));
    const [lastRows, unreadRows] = ids.length ? await Promise.all([
        messages.aggregate<{ _id: string, last: ChatMessage }>([
            { $match: { conversation: { $in: ids }, removed: { $ne: true } } }, { $sort: { conversation: 1, seq: -1 } },
            { $group: { _id: '$conversation', last: { $first: { kind: '$kind', text: '$text', createdAt: '$createdAt',
                snapshot: { title: '$snapshot.title' }, attachment: { name: '$attachment.name' } } } } },
        ]).toArray(),
        messages.aggregate<{ _id: string, count: number }>([
            { $match: { to: uid, removed: { $ne: true }, $or: pairs.map((pair) => ({ conversation: pair.id,
                seq: { $gt: conversationsById.get(pair.id)?.read?.[uid] || 0 } })) } },
            { $group: { _id: '$conversation', count: { $sum: 1 } } },
        ]).toArray(),
    ]) : [[], []];
    const lastById = new Map(lastRows.map((row) => [row._id, row.last]));
    const unreadById = new Map(unreadRows.map((row) => [row._id, row.count]));
    const online = scope.canTeach ? new Set(await presence.distinct('uid', { workspaceId: scope.workspaceId,
        uid: { $in: pairs.map((pair) => pair.studentUid) }, expiresAt: { $gt: new Date() } })) : null;
    const peers = pairs.map((pair) => {
        const last = lastById.get(pair.id);
        return { ...pair.peer, domainId: pair.domainId, unread: unreadById.get(pair.id) || 0,
            lastMessage: last ? chatPreview(last) : '', lastAt: last?.createdAt || null,
            ...(online ? { online: online.has(pair.studentUid) } : {}) };
    });
    peers.sort((a, b) => +(b.lastAt || 0) - +(a.lastAt || 0) || a.uid - b.uid);
    return { canTeach: scope.canTeach, peers, unread: peers.reduce((sum, item) => sum + item.unread, 0),
        quotaBytes: CHAT_QUOTA_BYTES, maxFileBytes: CHAT_FILE_BYTES, maxImageBytes: CHAT_IMAGE_BYTES };
}

export function serialize(message: ChatMessage, domainId: string, fullSnapshot = false, read?: boolean) {
    const prefix = `/d/${encodeURIComponent(domainId)}/class-chat`;
    let snapshot;
    if (message.snapshot) {
        const { media, content, code, html, ...publicSnapshot } = message.snapshot;
        snapshot = { ...publicSnapshot,
            ...(fullSnapshot ? { code, html, content: rewriteChatProblemMedia(content, publicSnapshot.pid, (media || []).map((file) => file.name),
                (name) => `${prefix}/snapshot/${message._id}/file/${encodeURIComponent(name)}`) }
                : { codePreview: code.split('\n').slice(0, 3).join('\n').slice(0, 500) }),
            url: `${prefix}/snapshot/${message._id}`,
            problemUrl: `/d/${encodeURIComponent(publicSnapshot.domainId)}/p/${publicSnapshot.pid}` };
    }
    return {
        id: message._id.toHexString(), from: message.from, to: message.to, seq: message.seq,
        kind: message.kind, text: message.text, createdAt: message.createdAt, clientId: message.clientId,
        ...(typeof read === 'boolean' ? { read } : {}),
        ...(message.attachment ? { attachment: { name: message.attachment.name, size: message.attachment.size,
            mime: message.attachment.mime, url: `${prefix}/attachment/${message._id}` } } : {}),
        ...(snapshot ? { snapshot } : {}),
    };
}

export async function page(pair: ChatPair, before?: string) {
    let beforeSeq: number;
    if (before) {
        const anchor = await messages.findOne({ _id: new ObjectId(before), conversation: pair.id, removed: { $ne: true } });
        if (!anchor) throw new ClassChatError('NOT_FOUND', '较早的消息已清理，请重新打开聊天。', 404);
        beforeSeq = anchor.seq;
    }
    const [items, size, conversation] = await Promise.all([
        messages.find({ conversation: pair.id, removed: { $ne: true }, ...(beforeSeq ? { seq: { $lt: beforeSeq } } : {}) })
            .sort({ seq: -1 }).limit(CHAT_PAGE_SIZE + 1).toArray(),
        messages.aggregate<{ bytes: number, oldestSeq: number }>([{ $match: { conversation: pair.id, removed: { $ne: true } } },
            { $group: { _id: null, bytes: { $sum: '$bytes' }, oldestSeq: { $min: '$seq' } } }]).next(),
        pair.canTeach ? conversations.findOne({ _id: pair.id }) : Promise.resolve(null),
    ]);
    return { messages: items.slice(0, CHAT_PAGE_SIZE).reverse().map((item) => serialize(item, pair.domainId, false,
        pair.canTeach && item.from === pair.teacherUid ? (conversation?.read?.[pair.studentUid] || 0) >= item.seq : undefined)),
        hasMore: items.length > CHAT_PAGE_SIZE, usedBytes: size?.bytes || 0, oldestSeq: size?.oldestSeq || 0,
        quotaBytes: CHAT_QUOTA_BYTES, peer: pair.peer };
}

export async function acknowledge(pair: ChatPair, uid: number, through: string) {
    const last = await messages.findOne({ _id: new ObjectId(through), conversation: pair.id, removed: { $ne: true } });
    if (!last) return;
    await conversations.updateOne({ _id: pair.id }, { $max: { [`read.${uid}`]: last.seq } });
}

async function withConversation<T>(pair: ChatPair, fn: (guard: () => Promise<void>) => Promise<T>) {
    const lease = opaqueId();
    let acquired = false;
    for (let attempt = 0; attempt < 30; attempt++) {
        try {
            const result = await conversations.findOneAndUpdate({ _id: pair.id,
                $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: new Date() } }] },
            { $set: { lock: lease, lockedUntil: new Date(Date.now() + 60_000) },
                $setOnInsert: { workspaceId: pair.workspaceId, teacherUid: pair.teacherUid, studentUid: pair.studentUid,
                    domainId: pair.domainId, seq: 0, read: {} } }, { upsert: true, returnDocument: 'after' });
            acquired = result?.lock === lease;
        } catch (error) { if (error.code !== 11000) throw error; }
        if (acquired) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!acquired) throw new ClassChatError('BUSY', '上一条消息正在保存，请稍后重试。', 409);
    const guard = async () => {
        const result = await conversations.updateOne({ _id: pair.id, lock: lease, lockedUntil: { $gt: new Date() } },
            { $set: { lockedUntil: new Date(Date.now() + 60_000) } });
        if (!result.matchedCount) throw new ClassChatError('BUSY', '消息保存中断，请重试。', 409);
    };
    try { return await fn(guard); }
    finally { await conversations.updateOne({ _id: pair.id, lock: lease }, { $unset: { lock: '', lockedUntil: '' } }); }
}

export async function issueSnapshotGrant(uid: number, domainId: string, pid: number) {
    const value = { _id: opaqueId(), uid, domainId, pid, expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
    await grants.insertOne(value);
    return value._id;
}

async function freezeSnapshot(pair: ChatPair, uid: number, value: any): Promise<ChatSnapshot> {
    // A peer may belong to several classrooms; check the exact source classroom too.
    const exact = await authorizePair(uid, uid === pair.teacherUid ? pair.studentUid : pair.teacherUid, value.domainId);
    if (exact.id !== pair.id) throw new ClassChatError('FORBIDDEN', '无法发送其他课堂的题目。', 403);
    const pdoc = await problem.get(value.domainId, value.pid);
    if (!pdoc || problem.isObjectiveSource(pdoc)) throw new ClassChatError('FORBIDDEN', '这道题目暂时不能发送。', 403);
    const account = await user.getById(value.domainId, uid);
    const grant = typeof value.grant === 'string' && await grants.findOne({ _id: value.grant, uid,
        domainId: value.domainId, pid: pdoc.docId, expiresAt: { $gt: new Date() } });
    if (!problem.canViewBy(pdoc, account) && !grant) throw new ClassChatError('FORBIDDEN', '请先打开有权限查看的题目，再发送给老师。', 403);
    const content = typeof pdoc.content === 'string' ? pdoc.content : JSON.stringify(pdoc.content);
    if (Buffer.byteLength(content || '') > 512 * 1024) throw new ClassChatError('SNAPSHOT_TOO_LARGE', '题目内容较大，请发送链接与代码文件。');
    const source = pdoc.reference ? await problem.get(pdoc.reference.domainId, pdoc.reference.pid) : pdoc;
    const media: NonNullable<ChatSnapshot['media']> = [];
    if (source && !problem.isObjectiveSource(source)) {
        const names = new Set<string>();
        rewriteChatProblemMedia(content || '', pdoc.docId, (source.additional_file || []).map((file) => file.name), (name) => {
            names.add(name); return '';
        });
        if (names.size > 100) throw new ClassChatError('SNAPSHOT_TOO_LARGE', '题目素材较多，请发送题目链接。');
        for (const name of names) {
            const path = `problem/${source.domainId}/${source.docId}/additional_file/${name}`;
            const meta = await storage.getMeta(path);
            if (meta) media.push({ name, path, etag: meta.etag, size: meta.size, mime: String(meta['Content-Type'] || 'application/octet-stream') });
        }
    }
    return { title: String(pdoc.title).slice(0, 300), content: content || '', html: !!pdoc.html, pid: pdoc.docId,
        domainId: value.domainId, lang: value.lang, code: value.code, ...(media.length ? { media } : {}) };
}

async function prepareAttachment(pair: ChatPair, uid: number, messageId: ObjectId, file: any) {
    if (!file || typeof file.filepath !== 'string') throw new ClassChatError('INVALID_FILE', '请选择一个文件。');
    const info = await stat(file.filepath);
    if (!info.isFile() || !info.size || info.size > CHAT_FILE_BYTES) throw new ClassChatError('FILE_TOO_LARGE', '文件不能超过 10MB。');
    const handle = await open(file.filepath, 'r');
    const bytes = Buffer.alloc(32);
    try { await handle.read(bytes, 0, 32, 0); } finally { await handle.close(); }
    const mime = chatImageMime(bytes);
    if (mime && info.size > CHAT_IMAGE_BYTES) throw new ClassChatError('IMAGE_TOO_LARGE', '图片不能超过 5MB。');
    const id = opaqueId();
    // The private .bin prefix is never eligible for public media redirects/CDN URLs.
    const path = `class-chat/${id}.bin`;
    await assets.insertOne({ _id: id, conversation: pair.id, messageId, path, createdAt: new Date(),
        checkAfter: new Date(Date.now() + 10 * 60_000) });
    try { await storage.put(path, file.filepath, uid); }
    catch (error) { await assets.updateOne({ _id: id }, { $set: { checkAfter: new Date() } }); throw error; }
    return { id, name: chatFilename(file.originalFilename), size: info.size, mime: mime || 'application/octet-stream' };
}

async function serializeSent(pair: ChatPair, message: ChatMessage) {
    if (!pair.canTeach || message.from !== pair.teacherUid) return serialize(message, pair.domainId);
    const conversation = await conversations.findOne({ _id: pair.id });
    return serialize(message, pair.domainId, false, (conversation?.read?.[pair.studentUid] || 0) >= message.seq);
}

async function pruneConversation(pair: ChatPair, incomingBytes: number, guard: () => Promise<void>) {
    if (incomingBytes > CHAT_QUOTA_BYTES) throw new ClassChatError('QUOTA', '单条消息超过了聊天空间上限。');
    const total = await messages.aggregate<{ bytes: number }>([
        { $match: { conversation: pair.id, removed: { $ne: true } } },
        { $group: { _id: null, bytes: { $sum: '$bytes' } } },
    ]).next();
    let usedBytes = (total?.bytes || 0) + incomingBytes;
    if (usedBytes <= CHAT_QUOTA_BYTES) return usedBytes;
    // Only visit old rows when space is actually needed; never materialize a full conversation.
    const cursor = messages.find({ conversation: pair.id, removed: { $ne: true } })
        .project<{ _id: ObjectId, bytes: number }>({ _id: 1, bytes: 1 }).sort({ seq: 1 }).batchSize(256);
    let pending: ObjectId[] = [];
    const flush = async () => {
        if (!pending.length) return;
        await guard();
        await messages.updateMany({ _id: { $in: pending }, conversation: pair.id }, { $set: { removed: true } });
        await assets.updateMany({ messageId: { $in: pending }, conversation: pair.id }, { $set: { checkAfter: new Date() } });
        await messages.deleteMany({ _id: { $in: pending }, conversation: pair.id, removed: true });
        pending = [];
    };
    try {
        while (usedBytes > CHAT_QUOTA_BYTES) {
            const item = await cursor.next();
            if (!item) throw new ClassChatError('BUSY', '聊天空间正在整理，请重试。', 409);
            usedBytes -= item.bytes;
            pending.push(item._id);
            if (pending.length === 256) await flush();
        }
        await flush();
    } finally { await cursor.close(); }
    return usedBytes;
}

export async function send(pair: ChatPair, uid: number, payload: any, file?: any) {
    const value = validateChatSend(payload);
    if (!value.text && !file && !value.snapshot) throw new ClassChatError('EMPTY', '写点什么再发送吧。');
    if (file && value.snapshot) throw new ClassChatError('INVALID_MESSAGE', '题目与文件请分别发送。');
    const previous = await messages.findOne({ conversation: pair.id, from: uid, clientId: value.clientId, removed: { $ne: true } });
    if (previous) return { message: await serializeSent(pair, previous), quotaBytes: CHAT_QUOTA_BYTES };
    const message: ChatMessage = { _id: new ObjectId(), conversation: pair.id, seq: 0, from: uid,
        to: uid === pair.teacherUid ? pair.studentUid : pair.teacherUid, clientId: value.clientId,
        kind: 'text', text: value.text, createdAt: new Date(), bytes: 0 };
    if (value.snapshot) { message.snapshot = await freezeSnapshot(pair, uid, value.snapshot); message.kind = 'snapshot'; }
    if (file) {
        message.attachment = await prepareAttachment(pair, uid, message._id, file);
        message.kind = message.attachment.mime.startsWith('image/') ? 'image' : 'file';
    }
    message.bytes = Buffer.byteLength(JSON.stringify(message)) + (message.attachment?.size || 0) + 256;
    try {
        const result = await withConversation(pair, async (guard) => {
            // Membership may change while an attachment uploads.
            await authorizePair(uid, message.to, pair.domainId);
            const duplicate = await messages.findOne({ conversation: pair.id, from: uid, clientId: value.clientId, removed: { $ne: true } });
            if (duplicate) return { message: await serializeSent(pair, duplicate), quotaBytes: CHAT_QUOTA_BYTES };
            const usedBytes = await pruneConversation(pair, message.bytes, guard);
            await guard();
            const conv = await conversations.findOneAndUpdate({ _id: pair.id }, { $inc: { seq: 1 } }, { returnDocument: 'after' });
            message.seq = conv.seq;
            await messages.insertOne(message);
            return { message: await serializeSent(pair, message), usedBytes, quotaBytes: CHAT_QUOTA_BYTES };
        });
        if (message.attachment && result.message.id !== message._id.toHexString()) {
            await assets.updateOne({ _id: message.attachment.id }, { $set: { checkAfter: new Date() } });
        }
        void cleanupAttachments().catch(() => {});
        return result;
    } catch (error) {
        if (message.attachment) await assets.updateOne({ _id: message.attachment.id }, { $set: { checkAfter: new Date() } });
        throw error;
    }
}

export async function authorizedMessage(uid: number, domainId: string, id: string) {
    const item = await messages.findOne({ _id: new ObjectId(id), removed: { $ne: true }, $or: [{ from: uid }, { to: uid }] });
    if (!item) throw new ClassChatError('NOT_FOUND', '消息已清理或没有访问权限。', 404);
    const conversation = await conversations.findOne({ _id: item.conversation });
    if (!conversation) throw new ClassChatError('NOT_FOUND', '消息已不存在。', 404);
    // Reuse any currently permitted classroom in this conversation's workspace.
    const classrooms = await workspace.getDomains(conversation.workspaceId);
    classrooms.sort((a, b) => Number(b._id === domainId) - Number(a._id === domainId));
    for (const classroom of classrooms) {
        try {
            const pair = await authorizePair(uid, item.from === uid ? item.to : item.from, classroom._id);
            if (pair.id === item.conversation) return { item, pair };
        } catch { /* Do not permit cross-tenant or revoked relationships. */ }
    }
    throw new ClassChatError('FORBIDDEN', '当前师生关系已不可用。', 403);
}

let cleaning: Promise<void> = null;
export function cleanupAttachments() {
    if (cleaning) return cleaning;
    cleaning = (async () => {
        // Recover a process interrupted between marking old messages and scheduling their attachment deletion.
        const abandoned = await messages.find({ removed: true }).project({ _id: 1 }).limit(1000).toArray();
        if (abandoned.length) {
            const ids = abandoned.map((item) => item._id);
            await assets.updateMany({ messageId: { $in: ids } }, { $set: { checkAfter: new Date() } });
            await messages.deleteMany({ _id: { $in: ids }, removed: true });
        }
        const pending = await assets.find({ checkAfter: { $lte: new Date() } }).limit(200).toArray();
        for (const asset of pending) {
            const live = await messages.findOne({ _id: asset.messageId, removed: { $ne: true }, 'attachment.id': asset._id });
            if (live) {
                // Do not postpone a deletion that a concurrent quota prune has just queued.
                await assets.updateOne({ _id: asset._id, checkAfter: asset.checkAfter },
                    { $set: { checkAfter: new Date(Date.now() + 24 * 60 * 60_000) } });
                continue;
            }
            try {
                await storage.del([asset.path]);
                await storage.coll.updateMany({ path: asset.path, autoDelete: { $ne: null } }, { $set: { autoDelete: new Date(0) } });
                await storage.cleanFiles([asset.path]);
                if (!await storage.coll.findOne({ path: asset.path })) await assets.deleteOne({ _id: asset._id });
            } catch { /* Keep the durable descriptor and retry after an I/O outage or restart. */ }
        }
    })().finally(() => { cleaning = null; });
    return cleaning;
}

let indexes: Promise<any>;
export function apply(ctx?: Context) {
    indexes ||= Promise.all([
        messages.createIndexes([
            { key: { conversation: 1, seq: -1 }, name: 'conversation_sequence', unique: true },
            { key: { conversation: 1, from: 1, clientId: 1 }, name: 'message_retry', unique: true },
            { key: { conversation: 1, to: 1, seq: -1 }, name: 'unread_messages' },
        ]),
        conversations.createIndexes([{ key: { workspaceId: 1, teacherUid: 1, studentUid: 1 }, name: 'conversation_pair', unique: true }]),
        assets.createIndexes([{ key: { checkAfter: 1 }, name: 'attachment_cleanup' }, { key: { messageId: 1 }, name: 'attachment_message' }]),
        grants.createIndexes([{ key: { expiresAt: 1 }, name: 'snapshot_grant_expiry', expireAfterSeconds: 0 }]),
        presence.createIndexes([{ key: { expiresAt: 1 }, name: 'chat_presence_expiry', expireAfterSeconds: 300 },
            { key: { workspaceId: 1, uid: 1, expiresAt: -1 }, name: 'chat_presence_workspace' }]),
    ]).catch((error) => { indexes = undefined; throw error; });
    if (ctx) {
        ctx.interval(() => cleanupAttachments().catch(() => {}), 60_000);
        ctx.interval(() => expirePresence().catch(() => {}), 15_000);
        ctx.on('user/delcache', clearRosterCache);
        ctx.on('domain/delete-cache', clearRosterCache);
    }
    return indexes;
}
