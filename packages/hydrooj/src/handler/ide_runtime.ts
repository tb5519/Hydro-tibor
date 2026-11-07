import type { Context } from '../context';
import { checkShareOrigin } from '../lib/live_share';
import { IdeError, IDE_LANGUAGES, IDE_LIMITS, validateIdeMessage } from '../lib/ide_protocol';
import { acquireIdeLease, leases } from '../lib/ide_quota';
import { IdeRuntime, ideSandboxUrl } from '../lib/ide_runtime';
import { getStudentSubmissionLanguages } from '../lib/student_submission_language';
import { PERM, PRIV } from '../model/builtin';
import domain from '../model/domain';
import * as share from '../model/live_share';
import * as setting from '../model/setting';
import system from '../model/system';
import token from '../model/token';
import { coll as users } from '../model/user';
import { ConnectionHandler } from '../service/server';

export class IdeRuntimeConnectionHandler extends ConnectionHandler {
    maxMessageBytes = IDE_LIMITS.codeBytes + 4096;
    private current: IdeRuntime;
    private currentLang: string;
    private disposed = false;
    private queue = Promise.resolve();
    private pending = 0;
    private checkedAt = 0;
    private checking = false;
    private languages: string[] = [];
    private seenRunIds = new Set<string>();
    private windowAt = 0;
    private windowMessages = 0;
    private windowBytes = 0;

    async prepare() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        this.checkPerm(PERM.PERM_SUBMIT_PROBLEM);
        if (this.session.sudoUid) throw new IdeError('FORBIDDEN', '请退出账号代看后运行程序。');
        checkShareOrigin(this.request.headers.origin, this.request.host);
        await this.limitRate('ide_connect', 60, 30);
        await this.authorize(true);
        this.send({ type: 'ready', languages: this.languages, limits: IDE_LIMITS });
        this.ctx.interval(() => {
            if (!this.current || this.checking || this.disposed) return;
            this.checking = true;
            this.authorize(true).catch(() => {
                this.current?.stop('当前账号已无权运行程序。');
                this.close(4003, 'Authorization revoked');
            }).finally(() => { this.checking = false; });
        }, 10_000);
    }

    private async authorize(force = false) {
        if (!force && Date.now() - this.checkedAt < 2000) return;
        const [login, account, classroom] = await Promise.all([
            this.session._id ? token.get(this.session._id, token.TYPE_SESSION) : null,
            users.findOne({ _id: this.user._id }), domain.get(this.domain._id),
        ]);
        let permitted = false;
        try {
            permitted = login && login.uid === this.user._id && !login.sudoUid && +login.expireAt > Date.now()
                && (BigInt(login.scope ?? PERM.PERM_ALL) & PERM.PERM_SUBMIT_PROBLEM) === PERM.PERM_SUBMIT_PROBLEM
                && account && (account.priv & PRIV.PRIV_USER_PROFILE) === PRIV.PRIV_USER_PROFILE;
        } catch { /* Invalid session fails closed. */ }
        if (!permitted || !classroom || classroom.domainType === 'scratch') throw new IdeError('FORBIDDEN', '当前账号无权使用在线运行。');
        try { await share.teacherScope(this.user._id, classroom._id); }
        catch { await share.studentScope(this.user._id, classroom._id); }
        const member = await domain.getDomainUser(classroom._id, account);
        if ((BigInt(member.perm || 0) & PERM.PERM_SUBMIT_PROBLEM) !== PERM.PERM_SUBMIT_PROBLEM) {
            throw new IdeError('FORBIDDEN', '当前课堂没有运行程序的权限。');
        }
        const domainLanguages = classroom.langs ? classroom.langs.split(',').map((lang) => lang.trim()) : null;
        const studentLanguages = getStudentSubmissionLanguages(account, classroom._id);
        this.languages = Object.keys(IDE_LANGUAGES).filter((lang) => setting.langs[lang] && !setting.langs[lang].disabled
            && !setting.langs[lang].remote && (!setting.langs[lang].hidden || domainLanguages?.includes(lang))
            && (!domainLanguages || domainLanguages.includes(lang)) && (!studentLanguages || studentLanguages.includes(lang)));
        if (this.current && !this.languages.includes(this.currentLang)) throw new IdeError('FORBIDDEN', '老师已调整可用语言，请重新选择语言。');
        this.checkedAt = Date.now();
    }
    private report(error: any, runId?: string) {
        if (this.disposed) return;
        this.send({ type: 'error', ...(runId ? { runId } : {}), code: error instanceof IdeError ? error.code : 'UNAVAILABLE', fatal: !this.current,
            message: error instanceof IdeError ? error.message : '运行服务暂时不可用，请稍后重试。' });
    }
    async message(payload: any) {
        if (this.disposed) return;
        try {
            const now = Date.now();
            if (now - this.windowAt >= 1000) { this.windowAt = now; this.windowMessages = 0; this.windowBytes = 0; }
            this.windowMessages++; this.windowBytes += Buffer.byteLength(JSON.stringify(payload));
            if (this.pending >= 32 || this.windowMessages > 100 || this.windowBytes > 256 * 1024) {
                this.current?.stop('操作过于频繁，运行已停止。');
                this.close(4008, 'Input backpressure'); return;
            }
            validateIdeMessage(payload);
        } catch (error) { this.report(error); return; }
        this.pending++;
        this.queue = this.queue.then(async () => { if (!this.disposed) await this.processMessage(payload); })
            .catch((error) => this.report(error, payload.runId)).finally(() => { this.pending--; });
        await this.queue;
    }
    private async processMessage(payload: any) {
        if (payload.type === 'stop' && this.current?.runId === payload.runId) { this.current.stop(); return; }
        await this.authorize(payload.type === 'run');
        if (payload.type === 'run') {
            // A replay, including after completion, must never start a second execution.
            if (this.seenRunIds.has(payload.runId)) return;
            if (this.current) throw new IdeError('ALREADY_RUNNING', '请先停止当前程序。');
            if (!this.languages.includes(payload.lang)) throw new IdeError('FORBIDDEN', '当前语言不在老师允许的范围内。');
            await this.limitRate('ide_run', 60, 15);
            const host = ideSandboxUrl(system.get('ide.sandboxHost'));
            const configured = Number(system.get('ide.concurrency'));
            const concurrency = Number.isInteger(configured) && configured >= 1 && configured <= 16 ? configured : 2;
            const lease = await acquireIdeLease(this.user._id, concurrency, Date.now(), IDE_LANGUAGES[payload.lang].family !== 'python');
            if (this.disposed) { await lease.release(); return; }
            this.seenRunIds.add(payload.runId);
            // The connection rate limit bounds this set, but still cap long-lived tabs.
            if (this.seenRunIds.size > 512) { await lease.release(); this.close(4000, 'Reconnect required'); return; }
            const runtime = new IdeRuntime(payload.runId, host, (message) => {
                if (this.disposed) return;
                if (this.conn.bufferedAmount > 512 * 1024) {
                    runtime.stop('连接较慢，运行已停止，请重新运行。');
                    this.close(4008, 'Output backpressure');
                    throw new IdeError('BACKPRESSURE', '连接较慢，运行已停止，请重新运行。');
                }
                this.send(message);
            }, async () => { await lease.releaseCompilation(); });
            this.current = runtime; this.currentLang = payload.lang;
            void runtime.start(payload.lang, payload.code).catch((error) => this.report(error, payload.runId)).finally(async () => {
                if (this.current === runtime) { this.current = null; this.currentLang = null; }
                if (runtime.safeToRelease) await lease.release().catch(() => {});
            });
            return;
        }
        if (!this.current || this.current.runId !== payload.runId) return;
        if (payload.type === 'stop') this.current.stop();
        else if (payload.type === 'input') this.current.input(payload.seq, payload.text);
        else if (payload.type === 'turtle-event') this.current.input(payload.seq, `${JSON.stringify(payload.event)}\n`, true);
    }
    async cleanup() {
        this.disposed = true;
        this.current?.stop('页面已离开，运行已停止。');
    }
}
export async function apply(ctx: Context) {
    await ctx.db.ensureIndexes(leases, { key: { expiresAt: 1 }, name: 'ide_lease_expiry', expireAfterSeconds: 0 });
    ctx.Connection('ide_conn', '/ide/conn', IdeRuntimeConnectionHandler, PERM.PERM_SUBMIT_PROBLEM);
}
