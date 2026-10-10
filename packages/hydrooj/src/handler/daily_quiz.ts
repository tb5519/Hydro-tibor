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
        if (isTeacherView(this)) {
            this.response.body = { state: { required: false, teacherPreview: true } };
            return;
        }
        const { policy, session } = await quiz.getSession(this.user._id);
        this.response.body = { state: quiz.presentSession(policy, session) };
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
const exemptPath = /^\/(?:daily-quiz|student-message\/ack|login|logout|oauth|lostpass|user\/(?:sudo|tfa)|home\/security|language|fs|asset|lazy|resource|service-worker-config)(?:\/|$)/;

export async function apply(ctx: Context) {
    ctx.Route('daily_quiz', '/daily-quiz', DailyQuizHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('daily_quiz_status', '/daily-quiz/status', DailyQuizStatusHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('daily_quiz_file', '/daily-quiz/:sessionId/file/:questionId/:filename', DailyQuizFileHandler, PRIV.PRIV_USER_PROFILE);
    // The serial preparation phase follows authentication and workspace checks.
    ctx.on('handler/before-prepare', async (handler: Handler) => {
        if (isTeacherView(handler) || !handler.user?.hasPriv(PRIV.PRIV_USER_PROFILE) || handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)
            || handler.user.hasPriv(PRIV.PRIV_JUDGE) || exemptPath.test(handler.request.path)) return undefined;
        const { policy, session } = await quiz.getSession(handler.user._id);
        if (!quiz.presentSession(policy, session).required) return undefined;
        const returnUrl = safeReturnUrl(handler.request.originalPath
            + (handler.request.querystring ? `?${handler.request.querystring}` : ''));
        const url = `/daily-quiz?return=${encodeURIComponent(returnUrl)}`;
        if (handler.request.json || !['GET', 'HEAD'].includes(handler.request.method.toUpperCase())) {
            handler.response.status = 403;
            handler.response.body = { error: 'daily_quiz_required', message: '请先完成今天的每日问答', dailyQuizUrl: url };
        } else handler.response.redirect = url;
        return 'cleanup';
    });
    ctx.on('handler/create/ws', async (handler) => {
        if (isTeacherView(handler) || !handler.user?.hasPriv(PRIV.PRIV_USER_PROFILE) || handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)
            || handler.user.hasPriv(PRIV.PRIV_JUDGE)) return;
        const { policy, session } = await quiz.getSession(handler.user._id);
        if (quiz.presentSession(policy, session).required) throw new ForbiddenError('请先完成今天的每日问答');
    });
}
