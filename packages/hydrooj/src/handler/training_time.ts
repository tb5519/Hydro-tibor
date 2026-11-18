import type { Context } from '../context';
import { CsrfTokenError, PermissionError, ValidationError } from '../error';
import { beijingDay } from '../lib/daily_quiz';
import { isScratchDomain } from '../lib/domain_type';
import { TRAINING_HEARTBEAT_SECONDS, TRAINING_IDLE_SECONDS, TrainingSource, trainingSourceKey } from '../lib/training_time';
import { Logger } from '../logger';
import { PERM, PRIV } from '../model/builtin';
import * as dailyQuiz from '../model/daily_quiz';
import domain from '../model/domain';
import record from '../model/record';
import * as training from '../model/training_time';
import user from '../model/user';
import { Handler } from '../service/server';

const logger = new Logger('training-time');

export function isTrainingStudent(handler: Handler) {
    return handler.user?._id > 1 && !handler.session?.sudoUid
        && handler.user.hasPriv(PRIV.PRIV_USER_PROFILE) && !handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)
        && !handler.user.hasPriv(PRIV.PRIV_JUDGE);
}

async function eligibleMember(handler: Handler, domainId: string) {
    if (!isTrainingStudent(handler)) return false;
    const ddoc = domainId === handler.domain?._id ? handler.domain : await domain.get(domainId);
    if (!ddoc || isScratchDomain(ddoc)) return false;
    const student = domainId === handler.domain?._id ? handler.user : await user.getById(domainId, handler.user._id);
    if (!student || !student.hasPerm(PERM.PERM_VIEW) || student.hasPerm(PERM.PERM_EDIT_DOMAIN)) return false;
    return !!await domain.collUser.findOne({ domainId, uid: handler.user._id, join: true, blockedByStudentManagement: { $ne: true } },
        { projection: { _id: 1 } });
}

function strictBody(body: Record<string, any>, keys: string[]) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key))) {
        throw new ValidationError('trainingTime');
    }
}

export class TrainingTimeHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (!await eligibleMember(this, this.domain._id)) throw new PermissionError('学员训练计时');
        if (this.request.method.toUpperCase() !== 'POST') throw new PermissionError('学员训练计时');
        const source = this.request.headers.origin || this.request.headers.referer;
        try {
            if (typeof source !== 'string' || new URL(source).host !== this.request.host) throw new CsrfTokenError();
        } catch { throw new CsrfTokenError(); }
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Cookie, Authorization');
    }
}

export class TrainingTimeSessionHandler extends TrainingTimeHandler {
    async post() {
        strictBody(this.request.body, ['sourceToken', 'requestId']);
        await this.limitRate('training_time_start', 60, 30, '{{user}}');
        this.response.body = await training.startSession(this.user._id, this.domain._id,
            this.request.body.sourceToken, this.request.body.requestId);
    }
}

export class TrainingTimeHeartbeatHandler extends TrainingTimeHandler {
    async post() {
        const pending = this.request.body?.requestId !== undefined || this.request.body?.sourceToken !== undefined;
        strictBody(this.request.body, [...(pending ? ['sourceToken', 'requestId'] : ['sessionId']), 'seq', 'active', 'discard', 'delayedByMs']);
        await this.limitRate('training_time_pulse', 60, 30, '{{user}}');
        const { sessionId, sourceToken, requestId, seq, active, discard = false, delayedByMs = 0 } = this.request.body;
        if (pending && (active !== false || seq !== 1)) throw new ValidationError('heartbeat');
        const now = new Date();
        this.response.body = pending
            ? await training.closePendingStart(this.user._id, this.domain._id, sourceToken, requestId, discard, now, delayedByMs)
            : await training.heartbeat(this.user._id, this.domain._id, sessionId, seq, active, discard, now, delayedByMs);
    }
}

function trainingContext(handler: Handler, domainId: string, contextKey: string) {
    return {
        enabled: true, scope: `${handler.user._id}:${domainId}`, contextKey,
        startUrl: handler.url('training_time_session', { domainId }),
        heartbeatUrl: handler.url('training_time_heartbeat', { domainId }),
        heartbeatSeconds: TRAINING_HEARTBEAT_SECONDS, idleSeconds: TRAINING_IDLE_SECONDS,
    };
}

/** Authorize the rendered exercise before minting its opaque grant. */
export async function trainingConfig(handler: Handler, domainId: string, source: TrainingSource) {
    const context = trainingContext(handler, domainId, `${domainId}:${trainingSourceKey(source)}`);
    try {
        if (!await eligibleMember(handler, domainId)) return null;
        return { ...context, sourceToken: await training.issueSourceGrant(handler.user._id, domainId, source) };
    } catch (error) {
        // Retry authorization through the original page before issuing any clock request.
        logger.warn('Unable to prepare training clock', error);
        return { ...context, sourceToken: '', pendingSource: true };
    }
}

function dailyRefreshUrl(sessionId: string, questionId: number) {
    return `/daily-quiz/training-grant?${new URLSearchParams({ sessionId, questionId: String(questionId) })}`;
}

/** A background grant renewal must never create a quiz, settle an answer or advance the cursor. */
export class DailyQuizTrainingGrantHandler extends Handler {
    noCheckPermView = true;

    async get() {
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Cookie, Authorization');
        this.response.body = { trainingTime: null };
        const { sessionId, questionId } = this.request.query;
        if (!isTrainingStudent(this) || sessionId !== `${this.user._id}-${beijingDay()}`
            || typeof questionId !== 'string' || !/^[1-9]\d*$/.test(questionId)) return;
        const session = await dailyQuiz.sessionColl.findOne({ _id: sessionId, uid: this.user._id, rolledForward: { $ne: true } },
            { projection: { cursor: 1, 'items.id': 1, 'items.domainId': 1, 'items.sourceId': 1, 'items.cancelled': 1 } });
        const item = session?.items[session.cursor];
        if (!item || item.cancelled || item.id !== Number(questionId)) return;
        const policy = await dailyQuiz.effectivePolicy(this.user._id);
        if (!policy.enabled || !policy.domains.some((rule) => rule.domainId === item.domainId)) return;
        const config = await trainingConfig(this, item.domainId, { kind: 'daily', pid: item.sourceId });
        if (config) this.response.body.trainingTime = { ...config, refreshUrl: dailyRefreshUrl(sessionId, item.id) };
    }
}

const studyTemplates = [
    'problem_detail.html', 'problem_submit.html', 'online_ide.html', 'record_detail.html', 'problem_solution.html',
];

function problemTrainingConfig(handler: Handler, domainId: string, pid: number) {
    const entry = handler.contestEntryContext;
    if (entry && entry.domain._id !== domainId && entry.contest.domainId === domainId && entry.contest.pids.includes(pid)) {
        return trainingConfig(handler, entry.domain._id, { kind: 'problem', pid, problemDomainId: domainId });
    }
    return trainingConfig(handler, domainId, { kind: 'problem', pid });
}

export async function injectTrainingConfig(handler: Handler) {
    if (handler.response.redirect || handler.response.status >= 400 || !isTrainingStudent(handler)) return;
    const dailyPage = handler.response.template === 'daily_quiz.html';
    const dailyApi = /^\/daily-quiz(?:\/status)?\/?$/.test(handler.request.path);
    if (dailyPage || dailyApi) {
        const state = handler.response.body?.state || handler.response.body?.dailyQuiz?.state;
        handler.response.body.trainingTime = null;
        if (dailyPage) handler.UiContext.trainingTime = null;
        if (!state?.enabled || !state.current || !state.sessionId) return;
        const refreshUrl = dailyRefreshUrl(state.sessionId, state.current.id);
        let config;
        try {
            const session = await dailyQuiz.sessionColl.findOne({ _id: state.sessionId, uid: handler.user._id },
                { projection: { items: { $elemMatch: { id: state.current.id } } } });
            const item = session?.items?.[0];
            if (!item || item.cancelled || item.domainId !== state.current.domainId) return;
            config = await trainingConfig(handler, item.domainId, { kind: 'daily', pid: item.sourceId });
        } catch (error) {
            logger.warn('Unable to resolve daily training source', error);
            config = { ...trainingContext(handler, state.current.domainId, ''), sourceToken: '', pendingSource: true };
        }
        const stamped = config && { ...config, refreshUrl };
        handler.response.body.trainingTime = stamped;
        if (dailyPage) handler.UiContext.trainingTime = stamped;
        return;
    }
    if (!studyTemplates.includes(handler.response.template)
        || handler.request.method.toUpperCase() !== 'GET') return;
    const query = handler.request.query || {};
    if (query.reviewUid !== undefined || query.mergedUid !== undefined) return;
    if (handler.response.template === 'record_detail.html') {
        // Use the authorized response, not request parameters or a record that
        // was fetched before its code/contest visibility checks completed.
        const { rdoc, pdoc, isPretestRecord } = handler.response.body || {};
        if (!rdoc || rdoc.uid !== handler.user._id || !Number.isSafeInteger(rdoc.pid) || rdoc.pid <= 0
            || typeof rdoc.domainId !== 'string' || !rdoc.domainId
            || !pdoc || pdoc.docId !== rdoc.pid || pdoc.domainId !== rdoc.domainId || isPretestRecord
            || [record.RECORD_PRETEST.toString(), record.RECORD_GENERATE.toString()].includes(rdoc.contest?.toString())) return;
        handler.UiContext.trainingTime = await problemTrainingConfig(handler, pdoc.domainId, pdoc.docId);
        return;
    }
    if (handler.response.template === 'online_ide.html') {
        handler.UiContext.trainingTime = await trainingConfig(handler, handler.domain._id, { kind: 'ide', pid: 0 });
        return;
    }
    const pdoc = (handler as Handler & { pdoc?: { docId: number } }).pdoc;
    if (!pdoc?.docId) return;
    if (handler.response.template === 'problem_solution.html'
        && !handler.response.body?.psdocs?.some((solution) => solution?.parentId === pdoc.docId
            && typeof solution.content === 'string' && solution.content.trim())) return;
    handler.UiContext.trainingTime = await problemTrainingConfig(handler, handler.domain._id, pdoc.docId);
}

export function apply(ctx: Context) {
    ctx.Route('daily_quiz_training_grant', '/daily-quiz/training-grant', DailyQuizTrainingGrantHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('training_time_session', '/training-time/session', TrainingTimeSessionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('training_time_heartbeat', '/training-time/heartbeat', TrainingTimeHeartbeatHandler, PRIV.PRIV_USER_PROFILE);
    ctx.on('handler/after', async (handler: Handler) => {
        // Learning must still work if optional analytics storage is unavailable.
        try { await injectTrainingConfig(handler); } catch (error) { logger.warn('Unable to prepare training clock', error); }
    });
    // A page left open overnight can renew its expired grant only by going
    // through the original page's current authorization and source selection.
    ctx.on('handler/finish', (handler: Handler) => {
        if (handler.request.query?.__trainingTimeGrant !== '1' || handler.request.method.toUpperCase() !== 'GET'
            || handler.response.redirect || handler.response.status >= 400
            || !studyTemplates.includes(handler.response.template)) return;
        handler.response.body = { trainingTime: handler.UiContext.trainingTime || null };
        handler.response.type = 'application/json';
        handler.response.template = null;
        handler.response.etag = null;
        handler.response.addHeader('Cache-Control', 'private, no-store');
        handler.response.addHeader('Vary', 'Cookie, Authorization');
    });
}
