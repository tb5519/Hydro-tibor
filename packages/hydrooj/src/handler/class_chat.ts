import type { Context } from '../context';
import avatar from '../lib/avatar';
import { ClassChatError, chatId, chatUid } from '../lib/class_chat';
import { emptyChatSolutionAnnotations } from '../lib/class_chat_solution';
import { getCppEditorMode } from '../lib/cpp_editor_mode';
import { checkShareOrigin } from '../lib/live_share';
import { PRIV } from '../model/builtin';
import * as chat from '../model/class_chat';
import * as solutions from '../model/class_chat_solution';
import storage from '../model/storage';
import token from '../model/token';
import { coll as users } from '../model/user';
import bus from '../service/bus';
import { ConnectionHandler, Handler, subscribe } from '../service/server';

function announce(uid: number, peerUid: number) {
    // Only invalidation metadata enters the shared bus; private messages remain in their protected collection.
    bus.broadcast('class-chat/changed', { uid, peerUid });
    bus.broadcast('class-chat/changed', { uid: peerUid, peerUid: uid });
}

export function redactClassChatLog(_type: string, handler: Handler | ConnectionHandler, args: any) {
    const path = handler.request.originalPath || handler.request.path || '';
    if (!/^\/(?:d\/[^/]+\/)?class-chat(?:\/|$)/.test(path)) return;
    // Slow uploads and denied requests must not duplicate private chat/code into the general operation log.
    for (const key of Object.keys(args)) if (!['operation', 'domainId', 'peerUid', 'id', 'before', 'through'].includes(key)) delete args[key];
}

async function checkLogin(handler: Handler | ConnectionHandler) {
    handler.checkPriv(PRIV.PRIV_USER_PROFILE);
    const login = handler.session._id ? await token.get(handler.session._id, token.TYPE_SESSION) : null;
    if (handler.session.sudoUid || !login || login.uid !== handler.user._id || login.sudoUid || +login.expireAt <= Date.now()) {
        throw new ClassChatError('FORBIDDEN', '请使用自己的账号登录后聊天。', 403);
    }
}

function domainId(value: unknown, fallback: string) {
    if (value === undefined || value === '') return fallback;
    if (typeof value !== 'string' || value.length > 128 || /[\\/\u0000-\u001f]/.test(value)) {
        throw new ClassChatError('INVALID_DOMAIN', '课堂信息不正确。');
    }
    return value;
}

export class ClassChatHandler extends Handler {
    noCheckPermView = true;

    async prepare() {
        await checkLogin(this);
        if (this.request.method.toUpperCase() === 'POST' && this.request.headers.origin) {
            checkShareOrigin(this.request.headers.origin, this.request.host);
        }
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
    }

    async get() {
        await this.limitRate('class_chat_fetch', 60, 180);
        const id = domainId(this.request.query?.domainId, this.domain._id);
        if (this.request.query?.solution) {
            this.response.body = await solutions.solutionState(this.user._id, id, chatId(this.request.query.solution));
            return;
        }
        if (!this.args.peerUid) this.response.body = await chat.peersFor(this.user._id, id);
        else {
            const pair = await chat.authorizePair(this.user._id, chatUid(this.args.peerUid), id);
            this.response.body = await chat.page(pair, this.args.before ? chatId(this.args.before) : undefined);
        }
    }

    async postSend() {
        await this.limitRate('class_chat_send', 60, 60);
        const value = this.request.body;
        const peerUid = chatUid(value.peerUid);
        const pair = await chat.authorizePair(this.user._id, peerUid, domainId(value.domainId, this.domain._id));
        const file = this.request.files?.file;
        if (file) await this.limitRate('class_chat_upload', 60, 12);
        if (Array.isArray(file)) throw new ClassChatError('INVALID_FILE', '每次选择一个文件即可。');
        this.response.body = await chat.send(pair, this.user._id, value, file);
        announce(this.user._id, peerUid);
    }

    async postRead() {
        await this.limitRate('class_chat_read', 60, 180);
        const value = this.request.body;
        const peerUid = chatUid(value.peerUid);
        const pair = await chat.authorizePair(this.user._id, peerUid, domainId(value.domainId, this.domain._id));
        await chat.acknowledge(pair, this.user._id, chatId(value.through));
        // Sync unread state across this account's tabs, without making recipients poll an extra time.
        bus.broadcast('class-chat/changed', { uid: this.user._id, peerUid });
        if (!pair.canTeach) bus.broadcast('class-chat/changed', { uid: pair.teacherUid, peerUid: this.user._id });
        this.response.body = { ok: true };
    }

    async postSolutionSave() {
        await this.limitRate('class_chat_solution_save', 60, 180);
        const value = this.request.body;
        this.response.body = { draft: await solutions.saveDraft(this.user._id, this.domain._id,
            chatId(value.snapshotId), value.content, value.revision) };
    }

    async postSolutionStandardSave() {
        await this.limitRate('class_chat_solution_standard', 60, 30);
        const value = this.request.body;
        this.response.body = { standard: await solutions.saveStandard(this.user._id, this.domain._id,
            chatId(value.snapshotId), value.content, value.revision) };
    }

    async postSolutionStandardLoad() {
        await this.limitRate('class_chat_solution_load', 60, 120);
        this.response.body = { standard: await solutions.loadStandard(this.user._id, this.domain._id, chatId(this.request.body.snapshotId)) };
    }

    async postSolutionSend() {
        await this.limitRate('class_chat_send', 60, 60);
        const value = this.request.body;
        this.response.body = await chat.sendSolution(this.user._id, this.domain._id, chatId(value.snapshotId), value.content, value.clientId);
        const message = this.response.body.message;
        announce(this.user._id, message.to);
    }

    async onerror(error: any) {
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        const known = error instanceof ClassChatError;
        const forbidden = ['FORBIDDEN', 'PrivilegeError', 'PermissionError'].includes(error.code || error.name);
        this.response.status = known ? error.status : forbidden ? 403 : 400;
        this.response.body = { error: { code: known ? error.code : forbidden ? 'FORBIDDEN' : 'UNAVAILABLE',
            message: known ? error.message : forbidden ? '当前账号没有权限访问这段聊天。' : '聊天暂时不可用，请稍后重试。' } };
    }
}

export class ClassChatAttachmentHandler extends ClassChatHandler {
    async get() {
        const { item } = await chat.authorizedMessage(this.user._id, this.domain._id, chatId(this.args.id));
        if (!item.attachment) throw new ClassChatError('NOT_FOUND', '文件已清理。', 404);
        const asset = await chat.assets.findOne({ _id: item.attachment.id, messageId: item._id });
        const meta = asset && await storage.getMeta(asset.path);
        if (!meta) throw new ClassChatError('NOT_FOUND', '文件已清理。', 404);
        this.response.type = item.attachment.mime;
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        this.response.addHeader('Referrer-Policy', 'no-referrer');
        this.response.addHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        this.response.addHeader('Content-Length', String(meta.size));
        const filename = encodeURIComponent(item.attachment.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
        this.response.disposition = `${item.kind === 'image' ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`;
        this.response.body = await storage.get(asset.path, undefined, meta);
    }

    async postSend() { throw new ClassChatError('METHOD', '不支持这个操作。', 405); }
    async postRead() { throw new ClassChatError('METHOD', '不支持这个操作。', 405); }
}

export class ClassChatSnapshotHandler extends ClassChatHandler {
    async get() {
        const { item, pair } = await chat.authorizedMessage(this.user._id, this.domain._id, chatId(this.args.id));
        if (!item.snapshot) throw new ClassChatError('NOT_FOUND', '题目与代码已清理。', 404);
        if (item.kind === 'solution' || (pair.canTeach && item.kind === 'snapshot' && item.from === pair.studentUid)) {
            this.response.redirect = `/d/${encodeURIComponent(pair.domainId)}/class-chat/solution/${item._id}`;
            return;
        }
        const sender = await users.findOne({ _id: item.from }, { projection: { _id: 1, uname: 1, displayName: 1, avatar: 1 } });
        const message = chat.serialize(item, pair.domainId, true);
        // Let the framework render the template; an explicit type bypasses its HTML rendering branch.
        this.response.type = undefined;
        this.response.template = 'class_chat_snapshot.html';
        this.response.body = { message, snapshot: message.snapshot, peer: pair.peer,
            sender: { uid: item.from, name: sender?.displayName || sender?.uname || String(item.from), avatarUrl: avatar(sender?.avatar || '', 80) } };
    }

    async postSend() { throw new ClassChatError('METHOD', '不支持这个操作。', 405); }
    async postRead() { throw new ClassChatError('METHOD', '不支持这个操作。', 405); }
}

export class ClassChatSolutionHandler extends ClassChatHandler {
    async get() {
        await this.limitRate('class_chat_solution_view', 60, 120);
        const { item, pair } = await chat.authorizedMessage(this.user._id, this.domain._id, chatId(this.args.id));
        if (!item.snapshot || !['snapshot', 'solution'].includes(item.kind)) {
            throw new ClassChatError('NOT_FOUND', '这份讲解已清理。', 404);
        }
        const canEdit = pair.canTeach && item.kind === 'snapshot' && item.from === pair.studentUid && item.to === this.user._id;
        if (item.kind === 'snapshot' && !canEdit) throw new ClassChatError('FORBIDDEN', '讲解完成后老师会发送给你。', 403);
        const sourceMessageId = item.solution?.sourceMessageId || item._id.toHexString();
        const message = chat.serialize(item, pair.domainId, true);
        const state = canEdit ? await solutions.solutionState(this.user._id, pair.domainId, sourceMessageId) : {
            draft: { code: item.snapshot.code, lang: item.snapshot.lang,
                annotations: item.solution?.annotations || emptyChatSolutionAnnotations(), revision: 0, updatedAt: item.createdAt },
            standard: null,
        };
        const sender = await users.findOne({ _id: item.from }, { projection: { _id: 1, uname: 1, displayName: 1, avatar: 1 } });
        this.UiContext.classChatSolution = { ...state, sourceMessageId, messageId: item._id.toHexString(),
            canEdit, apiUrl: `/d/${encodeURIComponent(pair.domainId)}/class-chat`, problemUrl: message.snapshot.problemUrl,
            cppEditorMode: await chat.snapshotCppEditorMode(item.snapshot, pair.studentUid),
            ...(canEdit ? { submitUrl: `/d/${encodeURIComponent(item.snapshot.domainId)}/p/${item.snapshot.pid}/submit` } : {}) };
        this.response.type = undefined;
        this.response.template = 'class_chat_solution.html';
        this.response.body = { message, snapshot: message.snapshot, peer: pair.peer, canEdit, solutionState: state,
            sender: { uid: item.from, name: sender?.displayName || sender?.uname || String(item.from), avatarUrl: avatar(sender?.avatar || '', 80) } };
    }
}

export class ClassChatSnapshotFileHandler extends ClassChatAttachmentHandler {
    async get() {
        const { item } = await chat.authorizedMessage(this.user._id, this.domain._id, chatId(this.args.id));
        const file = item.snapshot?.media?.find((entry) => entry.name === this.args.filename);
        if (!file) throw new ClassChatError('NOT_FOUND', '这份快照没有此素材。', 404);
        const meta = await storage.getMeta(file.path);
        // Never silently show replacement media as though it belonged to the original question.
        if (!meta || meta.etag !== file.etag || meta.size !== file.size) {
            throw new ClassChatError('NOT_FOUND', '原题素材已更新，请打开当前题目查看。', 404);
        }
        const inline = /^(?:image\/(?:png|jpeg|gif|webp|avif)|audio\/(?:mpeg|wav|ogg|x-wav)|video\/(?:mp4|webm|ogg))$/.test(file.mime);
        this.response.type = inline ? file.mime : 'application/octet-stream';
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        this.response.addHeader('Referrer-Policy', 'no-referrer');
        this.response.addHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        this.response.addHeader('Content-Length', String(meta.size));
        if (!inline) this.response.disposition = `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`;
        this.response.body = await storage.get(file.path, undefined, meta);
    }
}

export class ClassChatConnectionHandler extends ConnectionHandler {
    maxMessageBytes = 512;
    private disposed = false;
    private canTeach = false;
    private workspaceId = '';
    private presence: Awaited<ReturnType<typeof chat.connectPresence>>;

    async prepare() {
        await checkLogin(this);
        checkShareOrigin(this.request.headers.origin, this.request.host);
        await this.limitRate('class_chat_connect', 60, 60);
        const scope = await chat.resolveScope(this.user._id, this.domain._id);
        this.canTeach = scope.canTeach; this.workspaceId = scope.workspaceId;
        if (!this.canTeach) this.presence = await chat.connectPresence(this.user._id, scope.classroom._id);
        this.send({ type: 'ready' });
        this.ctx.interval(() => checkLogin(this).catch(() => this.close(4003, 'Login expired')), 30_000);
    }

    async message(value: any) {
        if (value?.type !== 'ping') return;
        await this.limitRate('class_chat_ping', 60, 20);
        await checkLogin(this);
        if (this.presence) await chat.pulsePresence(this.presence);
        this.send({ type: 'pong' });
    }

    @subscribe('class-chat/changed')
    async onChanged(event: chat.ChatEvent) {
        if (this.disposed || event.uid !== this.user._id) return;
        try { await checkLogin(this); this.send({ type: 'changed', peerUid: event.peerUid }); }
        catch { this.close(4003, 'Login expired'); }
    }

    @subscribe('class-chat/presence')
    async onPresence(event: { workspaceId: string }) {
        if (this.disposed || !this.canTeach || event.workspaceId !== this.workspaceId) return;
        try {
            await checkLogin(this);
            const scope = await chat.resolveScope(this.user._id, this.domain._id);
            if (scope.canTeach && scope.workspaceId === event.workspaceId) this.send({ type: 'changed' });
        } catch { this.close(4003, 'Login expired'); }
    }

    async cleanup() { this.disposed = true; await chat.disconnectPresence(this.presence); }
}

export async function injectClassChat(handler: Handler) {
    if (handler.request.method.toUpperCase() !== 'GET' || handler.response.redirect || handler.response.status >= 400
        || !handler.response.template || handler.user?._id <= 1 || !handler.user?.hasPriv(PRIV.PRIV_USER_PROFILE)
        || handler.session.sudoUid) return;
    const path = handler.request.originalPath.replace(/^\/d\/[^/]+(?=\/|$)/, '') || '/';
    if (/^\/(?:login|logout|register|lostpass|oauth)(?:\/|$)/i.test(path)
        || /^\/user\/(?:sudo|tfa|webauthn)(?:\/|$)/i.test(path) || /^\/home\/changeMail(?:\/|$)/i.test(path)) return;
    try {
        const scope = await chat.resolveScope(handler.user._id, handler.domain._id);
        const config: any = { enabled: true, uid: handler.user._id, canTeach: scope.canTeach,
            name: handler.user.displayName || handler.user.uname, avatarUrl: handler.user.avatarUrl,
            apiUrl: handler.url('class_chat', { domainId: scope.classroom._id }),
            socketUrl: handler.url('class_chat_conn', { domainId: scope.classroom._id }) };
        const pdoc = handler.response.body?.pdoc;
        // Contest/homework questions use the normal problem route plus query context;
        // the dedicated submission page is also a legitimate editor surface.
        if (pdoc?.docId && ['problem_detail.html', 'problem_submit.html'].includes(handler.response.template)
            && /^\/p\/[^/]+(?:\/submit)?\/?$/.test(path)) {
            config.problem = { pid: pdoc.docId, domainId: handler.domain._id, title: pdoc.title,
                grant: await chat.issueSnapshotGrant(handler.user._id, handler.domain._id, pdoc.docId,
                    String(handler.response.body?.tdoc?.docId || handler.response.body?.tdoc?._id || ''), getCppEditorMode(handler.user)) };
        }
        handler.UiContext.classChat = config;
    } catch { /* Ordinary visitors and non-classroom accounts have no chat launcher. */ }
}

export async function apply(ctx: Context) {
    await chat.apply();
    await solutions.apply(ctx);
    ctx.Route('class_chat', '/class-chat', ClassChatHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('class_chat_attachment', '/class-chat/attachment/:id', ClassChatAttachmentHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('class_chat_snapshot', '/class-chat/snapshot/:id', ClassChatSnapshotHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('class_chat_solution', '/class-chat/solution/:id', ClassChatSolutionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('class_chat_snapshot_file', '/class-chat/snapshot/:id/file/:filename', ClassChatSnapshotFileHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Connection('class_chat_conn', '/class-chat/conn', ClassChatConnectionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.on('handler/after', injectClassChat);
    ctx.on('oplog/log', redactClassChatLog);
}
