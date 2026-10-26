import { lookup } from 'mime-types';
import type { Context } from '../context';
import { ForbiddenError } from '../error';
import { safeReturnUrl } from '../lib/daily_quiz';
import { PRIV } from '../model/builtin';
import * as quiz from '../model/daily_quiz';
import storage from '../model/storage';
import {
    Handler, param, Types,
} from '../service/server';

// Only the authenticated account-switch route sets this session marker.
// Inspecting a learner must not create, advance or settle their daily practice.
function isTeacherView(handler: { session?: { sudoUid?: number } }) {
    return !!handler.session?.sudoUid;
}

function isExemptAccount(handler: Pick<Handler, 'session' | 'user'>) {
    return isTeacherView(handler) || !handler.user?.hasPriv(PRIV.PRIV_USER_PROFILE)
        || handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM) || handler.user.hasPriv(PRIV.PRIV_JUDGE);
}

export class DailyQuizHandler extends Handler {
    noCheckPermView = true;

    async prepare() {
        this.response.addHeader('Cache-Control', 'private, no-store');
    }

    async get() {
        if (isTeacherView(this)) {
            this.response.redirect = safeReturnUrl(this.request.query.return);
            return;
        }
        const { policy, session } = await quiz.getSession(this.user._id);
        const dailyQuiz = {
            state: quiz.presentSession(policy, session), actionUrl: '/daily-quiz', statusUrl: '/daily-quiz/status',
            returnUrl: safeReturnUrl(this.request.query.return),
        };
        this.response.template = 'daily_quiz.html';
        this.response.body = { dailyQuiz };
        this.UiContext.dailyQuiz = dailyQuiz;
    }

    async postAnswer() {
        if (isTeacherView(this)) throw new ForbiddenError('老师查看学员账号时不进行每日问答');
        const { sessionId, questionId, answers } = this.request.body;
        const result = await quiz.answerQuestion(this.user._id, sessionId, questionId, answers);
        this.response.body = { state: quiz.presentSession(result.policy, result.session) };
    }

    async postNext() {
        if (isTeacherView(this)) throw new ForbiddenError('老师查看学员账号时不进行每日问答');
        const { sessionId, questionId } = this.request.body;
        const result = await quiz.nextQuestion(this.user._id, sessionId, questionId);
        this.response.body = { state: quiz.presentSession(result.policy, result.session) };
    }
}

export class DailyQuizStatusHandler extends Handler {
    noCheckPermView = true;

    async get() {
        this.response.addHeader('Cache-Control', 'private, no-store');
        const serverNow = Date.now();
        if (isExemptAccount(this)) {
            this.response.body = { state: { required: false, ...(isTeacherView(this) ? { teacherPreview: true } : {}) }, serverNow };
            return;
        }
        const { policy, session } = await quiz.getSession(this.user._id);
        this.response.body = { state: quiz.presentSession(policy, session), serverNow };
    }
}

export class DailyQuizFileHandler extends Handler {
    noCheckPermView = true;

    @param('sessionId', Types.String)
    @param('questionId', Types.PositiveInt)
    @param('filename', Types.Filename)
    async get(domainId: string, sessionId: string, questionId: number, filename: string) {
        if (isTeacherView(this)) throw new ForbiddenError('老师查看学员账号时不进行每日问答');
        const target = await quiz.getSessionFile(this.user._id, sessionId, questionId, filename);
        this.response.body = await storage.get(target);
        this.response.type = lookup(filename) || 'application/octet-stream';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        if (!/\.(?:png|jpe?g|gif|webp|avif)$/i.test(filename)) this.response.disposition = `attachment; filename="${encodeURIComponent(filename)}"`;
    }
}

// Authentication and JavaScript bootstrap must remain reachable while entry is gated.
// eslint-disable-next-line max-len
const exemptPath = /^\/(?:daily-quiz|student-message\/ack|training-time\/(?:session|heartbeat)|login|logout|oauth|lostpass|user\/(?:sudo|tfa|avatar-effects)|home\/security|language|fs|asset|lazy|resource|service-worker-config)(?:\/|$)/;

/** Decorative reads keep their own authentication/ownership checks. Never
 * exempt page navigation, theme selection, uploads or other mutations. */
export function isDailyQuizMediaRead(path: string, method: string) {
    if (!['GET', 'HEAD'].includes(method?.toUpperCase())) return false;
    if (/^\/achievement\/[a-z0-9-]+\/image$/.test(path) || path === '/achievement/sound') return true;
    return /^\/(?:image-warmup|background-video-warmup|learning-media-warmup|code-editor\/themes|code-editor\/theme-asset\/[a-f\d]{32}\/[a-f\d]{24}|home\/(?:poster|video|video-poster)|badge\/[1-9]\d*\/(?:background|ac-image|background-video|background-video-poster|theme-sound|icon-image))$/.test(path);
}

/** Quiz rewards may unlock a notification while ordinary navigation stays gated. */
export function isDailyQuizAchievementRequest(path: string, method: string) {
    return (path === '/achievement/pending' && ['GET', 'HEAD'].includes(method?.toUpperCase()))
        || (path === '/achievement/ack' && method?.toUpperCase() === 'POST');
}

/** A blocked mutation must resume its page, never repeat an action endpoint. */
function returnPage(handler: Handler) {
    const request = handler.request;
    if (['GET', 'HEAD'].includes(request.method.toUpperCase())) {
        return safeReturnUrl(request.originalPath + (request.querystring ? `?${request.querystring}` : ''));
    }
    const source = request.referer || request.headers?.referer;
    if (source && !source.startsWith('//')) {
        if (source.startsWith('/')) return safeReturnUrl(source);
        try {
            const url = new URL(source);
            if (['http:', 'https:'].includes(url.protocol) && url.host === request.host && !url.username && !url.password) {
                return safeReturnUrl(`${url.pathname}${url.search}${url.hash}`);
            }
        } catch { /* Missing or foreign referrers fall back to a known read-only page. */ }
    }
    const problemPage = request.originalPath.match(/^(\/(?:d\/[^/]+\/)?p\/[^/]+)\/submit\/?$/)?.[1];
    return safeReturnUrl(problemPage);
}

export function injectDailyQuizGate(handler: Handler) {
    if (isExemptAccount(handler) || handler.request.method.toUpperCase() !== 'GET'
        || handler.request.json || handler.request.websocket || exemptPath.test(handler.request.path)
        || !handler.response.template || handler.response.redirect || handler.response.status >= 300
        || handler.request.query.noTemplate || handler.args?.pjax || handler.response.template === 'daily_quiz.html') return;
    // Keep checking even if a teacher enables practice after this page was opened.
    handler.UiContext.dailyQuizGate = { statusUrl: '/daily-quiz/status', serverNow: Date.now() };
    handler.response.addHeader('Cache-Control', 'private, no-store');
}

export async function apply(ctx: Context) {
    ctx.Route('daily_quiz', '/daily-quiz', DailyQuizHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('daily_quiz_status', '/daily-quiz/status', DailyQuizStatusHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('daily_quiz_file', '/daily-quiz/:sessionId/file/:questionId/:filename', DailyQuizFileHandler, PRIV.PRIV_USER_PROFILE);
    // The serial preparation phase follows authentication and workspace checks.
    ctx.on('handler/before-prepare', async (handler: Handler) => {
        if (isExemptAccount(handler) || exemptPath.test(handler.request.path)
            || isDailyQuizMediaRead(handler.request.path, handler.request.method)
            || isDailyQuizAchievementRequest(handler.request.path, handler.request.method)) return undefined;
        const { policy, session } = await quiz.getSession(handler.user._id);
        if (!quiz.presentSession(policy, session).required) return undefined;
        const returnUrl = returnPage(handler);
        const url = `/daily-quiz?return=${encodeURIComponent(returnUrl)}`;
        const headers = handler.request.headers || {};
        const json = handler.request.json || String(headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest'
            || String(headers['content-type'] || '').includes('application/json')
            || (['cors', 'same-origin', 'no-cors'].includes(String(headers['sec-fetch-mode'])) && headers['sec-fetch-dest'] === 'empty');
        handler.response.addHeader('Cache-Control', 'private, no-store');
        if (json) {
            const message = '今天的每日一练尚未完成，请先完成后继续做题。';
            handler.response.status = 403;
            handler.response.body = { error: { code: 'daily_quiz_required', message }, code: 'daily_quiz_required', message, dailyQuizUrl: url };
        } else handler.response.redirect = url;
        return 'cleanup';
    });
    ctx.on('handler/create/ws', async (handler) => {
        if (isExemptAccount(handler)) return;
        const { policy, session } = await quiz.getSession(handler.user._id);
        if (quiz.presentSession(policy, session).required) throw new ForbiddenError('请先完成今天的每日问答');
    });
    ctx.on('handler/after', injectDailyQuizGate);
}
