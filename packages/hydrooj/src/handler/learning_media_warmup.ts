import type { Context } from '../context';
import { getActiveBadgeAcTheme } from '../lib/badge_ac_theme';
import { PERM, PRIV } from '../model/builtin';
import { Handler } from '../service/server';
import { getEditorThemeCatalog } from './editor_theme';

/** Read-only catalog of the learner's selected artwork, not every theme. */
export class LearningMediaWarmupHandler extends Handler {
    async get() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        this.checkPerm(PERM.PERM_VIEW);
        const [catalog, acTheme] = await Promise.all([
            getEditorThemeCatalog(this),
            getActiveBadgeAcTheme(this.ctx, this.user, this.url.bind(this), this.domain),
        ]);
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Cookie, Authorization');
        this.response.body = {
            scope: `${this.user._id}:${this.domain._id}`,
            editorTheme: catalog.themes.find((theme) => theme.id === catalog.selectedId) || null,
            acTheme,
        };
    }
}

export function apply(ctx: Context) {
    ctx.Route('learning_media_warmup', '/learning-media-warmup', LearningMediaWarmupHandler, PRIV.PRIV_USER_PROFILE);
    ctx.on('handler/after', (handler: Handler) => {
        if (handler.response.template !== 'daily_quiz.html' || handler.response.redirect || handler.user?._id <= 1) return;
        handler.UiContext.learningMediaWarmup = {
            url: handler.url('learning_media_warmup'),
            scope: `${handler.user._id}:${handler.domain._id}`,
        };
    });
}
