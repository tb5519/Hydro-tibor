import type { Context } from '../context';
import { CsrfTokenError, PermissionError, ValidationError } from '../error';
import { isScratchDomain } from '../lib/domain_type';
import { TRAINING_HEARTBEAT_SECONDS, TRAINING_IDLE_SECONDS, TrainingSource } from '../lib/training_time';
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
        await this.limitRate('training_time_start', 60, 30);
        this.response.body = await training.startSession(this.user._id, this.domain._id,
            this.request.body.sourceToken, this.request.body.requestId);
    }
}

export class TrainingTimeHeartbeatHandler extends TrainingTimeHandler {
    async post() {
        strictBody(this.request.body, ['sessionId', 'seq', 'active', 'discard']);
        await this.limitRate('training_time_pulse', 60, 30);
        const { sessionId, seq, active, discard = false } = this.request.body;
        this.response.body = await training.heartbeat(this.user._id, this.domain._id, sessionId, seq, active, discard);
    }
}

/** Only a successfully authorized study response can mint a source grant.
 * Neither tracking endpoint accepts a user-chosen problem or duration. */
export async function trainingConfig(handler: Handler, domainId: string, source: TrainingSource) {
    if (!await eligibleMember(handler, domainId)) return null;
    return {
        enabled: true,
        scope: `${handler.user._id}:${domainId}`,
        contextKey: `${domainId}:${source.kind}:${source.pid}`,
        startUrl: handler.url('training_time_session', { domainId }),
        heartbeatUrl: handler.url('training_time_heartbeat', { domainId }),
        sourceToken: await training.issueSourceGrant(handler.user._id, domainId, source),
        heartbeatSeconds: TRAINING_HEARTBEAT_SECONDS,
        idleSeconds: TRAINING_IDLE_SECONDS,
    };
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
        const session = await dailyQuiz.sessionColl.findOne({ _id: state.sessionId, uid: handler.user._id },
            { projection: { items: { $elemMatch: { id: state.current.id } } } });
        const item = session?.items?.[0];
        if (!item || item.cancelled || item.domainId !== state.current.domainId) return;
        const config = await trainingConfig(handler, item.domainId, { kind: 'daily', pid: item.sourceId });
        handler.response.body.trainingTime = config;
        if (dailyPage) handler.UiContext.trainingTime = config;
        return;
    }
    if (!['problem_detail.html', 'problem_submit.html', 'online_ide.html', 'record_detail.html'].includes(handler.response.template)
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
        handler.UiContext.trainingTime = await trainingConfig(handler, pdoc.domainId, { kind: 'problem', pid: pdoc.docId });
        return;
    }
    if (handler.response.template === 'online_ide.html') {
        handler.UiContext.trainingTime = await trainingConfig(handler, handler.domain._id, { kind: 'ide', pid: 0 });
        return;
    }
    const pdoc = (handler as Handler & { pdoc?: { docId: number } }).pdoc;
    if (!pdoc?.docId) return;
    handler.UiContext.trainingTime = await trainingConfig(handler, handler.domain._id, { kind: 'problem', pid: pdoc.docId });
}

export function apply(ctx: Context) {
    ctx.Route('training_time_session', '/training-time/session', TrainingTimeSessionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('training_time_heartbeat', '/training-time/heartbeat', TrainingTimeHeartbeatHandler, PRIV.PRIV_USER_PROFILE);
    ctx.on('handler/after', async (handler: Handler) => {
        // Learning must still work if optional analytics storage is unavailable.
        try { await injectTrainingConfig(handler); } catch (error) { logger.warn('Unable to prepare training clock', error); }
    });
}
