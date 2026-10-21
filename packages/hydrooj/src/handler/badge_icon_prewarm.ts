import type { Context } from '../context';
import { getBadgeIconPreloads } from '../lib/badge_icon_prewarm';
import { PERM, PRIV } from '../model/builtin';
import type { Handler } from '../service/server';

/** Head hints are personalized exactly like the authenticated page itself. */
export async function injectBadgeIconPreloads(handler: Handler) {
    if (handler.request.method?.toLowerCase() !== 'get' || !handler.response.template
        || handler.response.redirect || handler.request.json || handler.request.websocket
        || handler.request.headers['x-pjax'] || handler.response.status >= 400
        || `${handler.request.headers['save-data'] || ''}`.toLowerCase() === 'on'
        || handler.user?._id <= 1 || !handler.user?.hasPriv(PRIV.PRIV_USER_PROFILE)
        || !handler.user.hasPerm(PERM.PERM_VIEW)) return;
    try {
        const urls = await getBadgeIconPreloads(handler.ctx, handler.domain, handler.user._id,
            handler.user.selectedBadgePresentation?.id);
        if (!urls.length) return;
        handler.UiContext.badgeIconPreloads = urls;
        handler.response.addHeader('Cache-Control', 'private, no-store');
        // Koa's vary() merges case-insensitively and preserves existing tokens
        // (including '*'); addHeader() would overwrite earlier content negotiation.
        handler.context.vary('Cookie');
        handler.context.vary('Authorization');
    } catch {
        // An optional hint must never delay access after a decoration lookup fails.
    }
}

export function apply(ctx: Context) {
    ctx.on('handler/after', injectBadgeIconPreloads);
}
