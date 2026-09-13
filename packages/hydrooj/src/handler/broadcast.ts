import type { Context } from '../context';
import {
    acknowledgeBroadcast, assertCanManageBroadcast, BroadcastScope, disableBroadcast, ensureBroadcastIndexes,
    getBroadcast, getBroadcastAcknowledgements, getUnreadBroadcasts, normalizeBroadcast, presentBroadcast, publishBroadcast,
} from '../lib/broadcast';
import { PERM, PRIV } from '../model/builtin';
import user from '../model/user';
import workspace from '../model/workspace';
import {
    Handler, param, post, Types,
} from '../service/server';

export class BroadcastManageHandler extends Handler {
    protected broadcastScope: BroadcastScope = 'global';

    async prepare() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        await assertCanManageBroadcast(this.user, this.broadcastScope);
    }

    private get routeName() {
        return this.broadcastScope === 'global' ? 'manage_broadcast' : 'domain_broadcast';
    }

    private async getReceipts(revision: string, page = 1) {
        const receipts = await getBroadcastAcknowledgements(this.broadcastScope, this.domain._id, revision, page);
        const udict = receipts.rows.length ? await user.getListForRender(
            this.broadcastScope === 'global' ? 'system' : this.domain._id,
            receipts.rows.map((row) => row.uid), this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO),
        ) : {};
        return {
            ...receipts,
            rows: receipts.rows.map((row) => ({
                uid: row.uid,
                name: udict[row.uid]?.displayName || udict[row.uid]?.uname || `学员 ${row.uid}`,
                uname: udict[row.uid]?.uname || '',
                acknowledgedAt: row.acknowledgedAt,
            })),
        };
    }

    @param('saved', Types.Int, true)
    async get(domainId: string, saved = 0) {
        const broadcast = await getBroadcast(this.broadcastScope, this.domain._id);
        this.response.template = 'broadcast_manage.html';
        this.response.body = {
            broadcastBaseTemplate: this.broadcastScope === 'global' ? 'manage_base.html' : 'domain_base.html',
            broadcastScope: this.broadcastScope,
            broadcastScopeLabel: this.broadcastScope === 'global' ? '全域广播' : `${this.domain.name} · 域广播`,
            broadcast: broadcast ? presentBroadcast(broadcast) : {
                title: '', content: '', revision: '', enabled: false, updatedAt: null,
            },
            saved: !!saved,
            manageRoute: this.routeName,
            broadcastReceipts: await this.getReceipts(broadcast?.revision || ''),
        };
    }

    @post('revision', Types.String, true)
    @post('page', Types.Int, true)
    async postReceipts(domainId: string, revision = '', page = 1) {
        this.response.body = { receipts: await this.getReceipts(revision, page) };
    }

    @post('title', Types.String)
    @post('content', Types.Content)
    @post('revision', Types.String, true)
    async postPublish(domainId: string, title: string, content: string, revision = '') {
        const broadcast = await publishBroadcast(this.broadcastScope, this.domain._id, this.user._id, title, content, revision);
        this.response.body = { broadcast: presentBroadcast(broadcast), saved: true };
        if (!this.request.json) this.response.redirect = this.url(this.routeName, { query: { saved: 1 } });
    }

    @post('revision', Types.String)
    async postDisable(domainId: string, revision: string) {
        const broadcast = await disableBroadcast(this.broadcastScope, this.domain._id, revision);
        this.response.body = { broadcast: presentBroadcast(broadcast), saved: true };
        if (!this.request.json) this.response.redirect = this.url(this.routeName, { query: { saved: 1 } });
    }

    @post('title', Types.String)
    @post('content', Types.Content)
    async postPreview(domainId: string, title: string, content: string) {
        this.response.body = normalizeBroadcast(title, content);
    }
}

export class DomainBroadcastManageHandler extends BroadcastManageHandler {
    protected broadcastScope: BroadcastScope = 'domain';
}

export class BroadcastAcknowledgeHandler extends Handler {
    @post('scope', Types.Range(['global', 'domain']))
    @post('revision', Types.String)
    async post(domainId: string, scope: BroadcastScope, revision: string) {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        await acknowledgeBroadcast(this.user, this.domain, scope, revision);
        this.response.body = { acknowledged: true };
    }
}

export async function injectUnreadBroadcasts(handler: Handler) {
    if (handler.request.method.toLowerCase() !== 'get' || !handler.response.template
        || handler.response.redirect || handler.request.json || handler.request.websocket
        || handler.request.headers['x-pjax'] || handler.response.status >= 400) return;
    const currentDomain = handler.contestEntryContext?.domain || handler.domain;
    const currentUser = handler.contestEntryContext
        ? await user.getById(currentDomain._id, handler.user._id, handler.session.scope) : handler.user;
    handler.UiContext.broadcasts = await getUnreadBroadcasts(currentUser, currentDomain);
    if (handler.UiContext.broadcasts.length) {
        handler.UiContext.broadcastAckUrl = handler.url('broadcast_ack', { domainId: currentDomain._id });
    }
}

export async function apply(ctx: Context) {
    await ensureBroadcastIndexes();
    const legacyOwnerUid = (await workspace.getLegacyWorkspace()).ownerUid;
    ctx.Route('manage_broadcast', '/manage/broadcast', BroadcastManageHandler);
    ctx.Route('domain_broadcast', '/domain/broadcast', DomainBroadcastManageHandler);
    ctx.Route('broadcast_ack', '/broadcast/ack', BroadcastAcknowledgeHandler, PRIV.PRIV_USER_PROFILE);
    ctx.injectUI('ControlPanel', 'manage_broadcast', { before: 'manage_setting' }, (handler) => handler.user._id === legacyOwnerUid);
    ctx.injectUI('DomainManage', 'domain_broadcast', { family: 'Properties', icon: 'info', before: 'domain_edit' }, PERM.PERM_EDIT_DOMAIN);
    ctx.on('handler/after', injectUnreadBroadcasts);
}
