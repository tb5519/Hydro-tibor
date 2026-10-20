import type { Context } from '../context';
import { ValidationError } from '../error';
import { getDomainRankingMode } from '../lib/domain_ranking';
import { invalidateSharedRankingSnapshot } from '../lib/shared_ranking';
import { PERM } from '../model/builtin';
import system from '../model/system';
import { ConnectionHandler, Handler, subscribe } from '../service/server';
import { getRankingPage } from './domain';

export interface RankingUpdate { uid?: number; domainIds: string[]; revision: string }

export class RankingLiveHandler extends Handler {
    async get(domainId: string) {
        this.checkPerm(PERM.PERM_VIEW_RANKING);
        const view = this.request.query.view || 'ranking';
        if (!['ranking', 'homepage'].includes(view)) throw new ValidationError('view');
        const page = Number(this.request.query.page || 1);
        const limit = view === 'homepage' ? Number(this.request.query.limit || 10) : system.get('pagination.ranking') || 100;
        if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000
            || !Number.isSafeInteger(limit) || limit < 1 || (view === 'homepage' && limit > 100)) {
            throw new ValidationError('page');
        }
        const data = await getRankingPage(this, domainId, view === 'homepage' ? 1 : page, limit);
        const body = view === 'homepage' ? {
            ...data, payload: data.udocs.map((udoc) => udoc._id),
            udict: Object.fromEntries(data.udocs.map((udoc) => [udoc._id, udoc])),
        } : data;
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Cookie, Authorization');
        this.response.body = {
            view,
            html: await this.renderHTML(view === 'homepage'
                ? 'partials/homepage/ranking_rows.html' : 'partials/ranking_content.html', body),
        };
    }
}

/** Public ranking invalidation only: no record IDs, code or contest details. */
export class RankingLiveConnectionHandler extends ConnectionHandler {
    prepare() { this.checkPerm(PERM.PERM_VIEW_RANKING); }

    @subscribe('ranking/update')
    onRankingUpdate(update: RankingUpdate) {
        if (!Array.isArray(update?.domainIds) || !update.domainIds.length) return;
        if (getDomainRankingMode(this.domain) !== 'all' && !update.domainIds.includes(this.domain._id)) return;
        // Invalidate before notifying this worker's connected clients, even if
        // another listener's registration order differs across workers.
        invalidateSharedRankingSnapshot();
        this.send({ type: 'ranking-update', revision: update.revision });
    }
}

export function apply(ctx: Context) {
    ctx.Route('ranking_live', '/ranking/live', RankingLiveHandler, PERM.PERM_VIEW_RANKING);
    ctx.Connection('ranking_live_conn', '/ranking/live-conn', RankingLiveConnectionHandler, PERM.PERM_VIEW_RANKING);
    ctx.on('ranking/update', invalidateSharedRankingSnapshot);
    ctx.on('handler/after', (handler: Handler) => {
        if (!['main.html', 'ranking.html'].includes(handler.response.template)
            || !handler.user.hasPerm(PERM.PERM_VIEW_RANKING)) return;
        handler.UiContext.rankingLiveUrl = handler.url('ranking_live');
        handler.UiContext.rankingLiveSocket = handler.url('ranking_live_conn');
    });
}
