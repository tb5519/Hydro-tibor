import type { Context } from '../context';
import { checkShareOrigin } from '../lib/live_share';
import { IdeError, IDE_LANGUAGES, IDE_LIMITS, validateIdeMessage } from '../lib/ide_protocol';
import { acquireIdeLease, finishIdeReset, getIdeCapacity, getIdeControl, ideConcurrency, leases, requestIdeReset } from '../lib/ide_quota';
import { IdeRuntime, ideSandboxUrl } from '../lib/ide_runtime';
import { getStudentSubmissionLanguages } from '../lib/student_submission_language';
import { PERM, PRIV } from '../model/builtin';
import domain from '../model/domain';
import * as share from '../model/live_share';
import * as setting from '../model/setting';
import system from '../model/system';
import token from '../model/token';
import { coll as users } from '../model/user';
import workspace from '../model/workspace';
import { ConnectionHandler, Handler } from '../service/server';

/** Both HTTP status/actions and live runs validate the real, fresh session and classroom. */
export async function authorizeIdeAccess(handler: Handler | ConnectionHandler) {
    if (handler.session.sudoUid) throw new IdeError('FORBIDDEN', '请退出账号代看后使用在线运行。');
    const [login, account, classroom] = await Promise.all([
        handler.session._id ? token.get(handler.session._id, token.TYPE_SESSION) : null,
        users.findOne({ _id: handler.user._id }), domain.get(handler.domain._id),
    ]);
    let permitted = false;
    try {
        permitted = login && login.uid === handler.user._id && !login.sudoUid && +login.expireAt > Date.now()
            && (BigInt(login.scope ?? PERM.PERM_ALL) & PERM.PERM_SUBMIT_PROBLEM) === PERM.PERM_SUBMIT_PROBLEM
            && account && (account.priv & PRIV.PRIV_USER_PROFILE) === PRIV.PRIV_USER_PROFILE;
    } catch { /* Invalid session fails closed. */ }
    if (!permitted || !classroom || classroom.domainType === 'scratch') throw new IdeError('FORBIDDEN', '当前账号无权使用在线运行。');
    let teacher: Awaited<ReturnType<typeof share.teacherScope>> = null;
    try { teacher = await share.teacherScope(handler.user._id, classroom._id); }
    catch {
        try { await share.studentScope(handler.user._id, classroom._id); }
        catch { throw new IdeError('FORBIDDEN', '当前账号已不在可用课堂范围内。'); }
    }
    const member = await domain.getDomainUser(classroom._id, account);
    if ((BigInt(member.perm || 0) & PERM.PERM_SUBMIT_PROBLEM) !== PERM.PERM_SUBMIT_PROBLEM) {
        throw new IdeError('FORBIDDEN', '当前课堂没有运行程序的权限。');
    }
    const domainLanguages = classroom.langs ? classroom.langs.split(',').map((lang) => lang.trim()) : null;
    // Match the existing Scratchpad preference, using freshly authenticated
    // account/membership data rather than a mode supplied by the browser.
    const modes = ['beginner', 'preset', 'proficient'];
    const editorMode = modes.includes(account.cppEditorMode) ? account.cppEditorMode : member.cppEditorMode;
    const beginnerCpp = editorMode === 'beginner';
    const studentLanguages = getStudentSubmissionLanguages(account, classroom._id);
    const languages = Object.keys(IDE_LANGUAGES).filter((lang) => setting.langs[lang] && !setting.langs[lang].disabled
        && !setting.langs[lang].remote && (!setting.langs[lang].hidden || domainLanguages?.includes(lang))
        && (!domainLanguages || domainLanguages.includes(lang)) && (!studentLanguages || studentLanguages.includes(lang)));
    const legacyAdmin = teacher?.workspaceId === workspace.LEGACY_WORKSPACE_ID
        && (workspace.isLegacyOwner(account._id) || (account.priv & PRIV.PRIV_EDIT_SYSTEM) === PRIV.PRIV_EDIT_SYSTEM);
    const canRelease = !!teacher && (workspace.isPlatformAdmin(account._id) || legacyAdmin)
        && (BigInt(login.scope ?? PERM.PERM_ALL) & PERM.PERM_EDIT_DOMAIN) === PERM.PERM_EDIT_DOMAIN;
    return { languages, beginnerCpp, canRelease };
}

export class IdeRuntimeConnectionHandler extends ConnectionHandler {
    maxMessageBytes = IDE_LIMITS.codeBytes + 4096;
    private current: IdeRuntime;
    private currentLang: string;
    private currentRevision = 0;
    private checkingReset = false;
    private disposed = false;
    private queue = Promise.resolve();
    private pending = 0;
    private checkedAt = 0;
    private checking = false;
    private languages: string[] = [];
    private beginnerCpp = false;
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
        // A durable revision works across Hydro workers, reconnects and missed
        // broadcasts. Check active runs only; at four slots this is <= 4 reads/s.
        this.ctx.interval(() => this.checkReset(), 1000);
    }

    private async checkReset() {
        if (!this.current || this.checkingReset || this.disposed) return;
        this.checkingReset = true;
        const runtime = this.current;
        const revision = this.currentRevision;
        try {
            const control = await getIdeControl();
            if (control.resetting || control.revision !== revision) runtime.stop('老师已停止全部在线 IDE 程序。');
        } catch { runtime.stop('运行服务连接暂时不可用，程序已停止。'); }
        finally { this.checkingReset = false; }
    }

    private async authorize(force = false) {
        if (!force && Date.now() - this.checkedAt < 2000) return;
        const access = await authorizeIdeAccess(this);
        this.languages = access.languages; this.beginnerCpp = access.beginnerCpp;
        if (this.current && !this.languages.includes(this.currentLang)) throw new IdeError('FORBIDDEN', '老师已调整可用语言，请重新选择语言。');
        this.checkedAt = Date.now();
    }
    private prepareSource(lang: string, code: string) {
        if (!this.beginnerCpp || IDE_LANGUAGES[lang].family !== 'cpp') return code;
        // Beginner editors contain the main body only. Keep complete programs
        // intact, just as the existing problem-submission handler does.
        const body = code.replace(/\r\n/g, '\n');
        // A lesson comment or printed string mentioning "int main()" is not a
        // function declaration. Remove lexical trivia for detection only; the
        // original student source is preserved in the compiled program.
        const syntax = body.replace(/\\\n/g, '').replace(
            /R"([^\s()\\]{0,16})\([\s\S]*?\)\1"|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ' ',
        ).replace(/^[\t ]*#[^\n]*/gm, ' ');
        if (/\b(?:int|signed|auto)\s+main\s*\(/.test(syntax)) return body;
        const source = `#include<bits/stdc++.h>\nusing namespace std;\nint main(){\n${body}${body && !body.endsWith('\n') ? '\n' : ''}\n    return 0;\n}\n`;
        if (Buffer.byteLength(source) > IDE_LIMITS.codeBytes) throw new IdeError('CODE_LIMIT', '代码过长，请精简后重新运行。');
        return source;
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
            const source = this.prepareSource(payload.lang, payload.code);
            await this.limitRate('ide_run', 60, 15);
            const host = ideSandboxUrl(system.get('ide.sandboxHost'));
            const concurrency = ideConcurrency(system.get('ide.concurrency'));
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
            this.current = runtime; this.currentLang = payload.lang; this.currentRevision = lease.revision;
            void runtime.start(payload.lang, source).catch((error) => this.report(error, payload.runId)).finally(async () => {
                if (this.current === runtime) { this.current = null; this.currentLang = null; }
                if (runtime.safeToRelease) {
                    await lease.release().then(() => finishIdeReset()).catch(() => {});
                }
            });
            return;
        }
        if (!this.current || this.current.runId !== payload.runId) return;
        if (payload.type === 'stop') this.current.stop();
        else if (payload.type === 'input') this.current.input(payload.seq, payload.text);
        else if (payload.type === 'input-draft') this.current.inputDraft(payload.seq, payload.text);
        else if (payload.type === 'turtle-event') this.current.input(payload.seq, `${JSON.stringify(payload.event)}\n`, true);
    }
    async cleanup() {
        this.disposed = true;
        this.current?.stop('页面已离开，运行已停止。');
    }
}
/** Reject cross-site requests even if ambient session cookies are present. */
export function checkIdeHttpOrigin(handler: Handler, mutation = false) {
    const headers = handler.request.headers;
    if (headers['sec-fetch-site'] && headers['sec-fetch-site'] !== 'same-origin') {
        throw new IdeError('FORBIDDEN', '请从当前平台使用运行状态。');
    }
    try {
        if (headers.origin) checkShareOrigin(headers.origin, handler.request.host);
        else if (mutation) throw new Error('Origin required');
        else if (headers['sec-fetch-site'] !== 'same-origin') checkShareOrigin(headers.referer, handler.request.host);
    } catch { throw new IdeError('FORBIDDEN', '请从当前平台使用运行状态。'); }
}

export class IdeCapacityHandler extends Handler {
    protected async status(mutation = false) {
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Cookie, Authorization');
        try {
            this.checkPriv(PRIV.PRIV_USER_PROFILE);
            this.checkPerm(PERM.PERM_SUBMIT_PROBLEM);
            checkIdeHttpOrigin(this, mutation);
            const access = await authorizeIdeAccess(this);
            if (!access.languages.length || (mutation && !access.canRelease)) throw new IdeError('FORBIDDEN', '当前账号无权执行此操作。');
            await this.limitRate(mutation ? 'ide_release' : 'ide_capacity', 60, mutation ? 10 : 120);
            if (mutation) await requestIdeReset(this.user._id);
            this.response.body = { ...await getIdeCapacity(this.user._id, ideConcurrency(system.get('ide.concurrency'))), canRelease: access.canRelease };
        } catch (error) {
            this.response.status = error instanceof IdeError && error.code === 'FORBIDDEN' ? 403 : 503;
            this.response.body = { error: error instanceof IdeError ? error.code : 'UNAVAILABLE',
                message: error instanceof IdeError ? error.message : '暂时无法查询运行状态，请稍后重试。' };
        }
    }
    async get() { await this.status(); }
}
export class IdeReleaseHandler extends IdeCapacityHandler {
    async post() { await this.status(true); }
}

export async function apply(ctx: Context) {
    await ctx.db.ensureIndexes(leases, { key: { expiresAt: 1 }, name: 'ide_lease_expiry', expireAfterSeconds: 0 });
    ctx.Connection('ide_conn', '/ide/conn', IdeRuntimeConnectionHandler, PERM.PERM_SUBMIT_PROBLEM);
    ctx.Route('ide_capacity', '/ide/capacity', IdeCapacityHandler, PERM.PERM_SUBMIT_PROBLEM);
    ctx.Route('ide_release', '/ide/release', IdeReleaseHandler, PERM.PERM_SUBMIT_PROBLEM);
}
