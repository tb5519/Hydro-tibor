const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, after, beforeEach, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { WebSocketServer } = require('ws');
const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, Buffer, URL, Date, process, console, fetch, AbortSignal,
        setTimeout, clearTimeout, __dirname: path.dirname(path.join(root, file)),
        require: (name) => dependencies[name] ?? require(name) });
    return module.exports;
}
const protocol = load('packages/hydrooj/src/lib/ide_protocol.ts');
const watchdogModule = load('packages/hydrooj/src/lib/ide_watchdog.ts', { './ide_protocol': protocol });
const runtimeModule = load('packages/hydrooj/src/lib/ide_runtime.ts', { './ide_protocol': protocol, './ide_watchdog': watchdogModule });
const errorCode = (code) => (error) => error.code === code;
const runId = 'runtime-test-0123456789';
const waitFor = async (predicate, timeout = 1000) => {
    for (let i = 0; i < timeout / 10; i++) { if (await predicate()) return; await new Promise((resolve) => setTimeout(resolve, 10)); }
    throw new Error('Timed out waiting');
};
let mongo; let client; let database; let quota;
before(async () => {
    mongo = await MongoMemoryServer.create(); client = await MongoClient.connect(mongo.getUri()); database = client.db('ide');
    quota = load('packages/hydrooj/src/lib/ide_quota.ts', { '../service/db': { collection: (name) => database.collection(name) }, './ide_protocol': protocol });
});
after(async () => { await client?.close(); await mongo?.stop(); });
beforeEach(async () => { await Promise.all(['ide.lease', 'ide.control'].map((name) => database.collection(name).deleteMany({}))); });

describe('interactive IDE trust boundary', () => {
    it('accepts only fixed languages, bounded code/input and validated graphical events', () => {
        protocol.validateIdeMessage({ type: 'run', runId, lang: 'py.py3', code: 'print(1)' });
        protocol.validateIdeMessage({ type: 'turtle-event', runId, seq: 0, event: { type: 'click', x: 0, y: 1, button: 1 } });
        protocol.validateIdeMessage({ type: 'input-draft', runId, seq: 1, text: '正在输入' });
        for (const payload of [
            { type: 'run', runId, lang: '__proto__', code: 'echo hello' },
            { type: 'run', runId, lang: 'bash', code: 'id' },
            { type: 'run', runId, lang: 'py.py3', code: '中'.repeat(60000) },
            { type: 'input', runId, seq: 1, text: '\0' },
            { type: 'input-draft', runId, seq: 1, text: '中'.repeat(6000) },
            { type: 'turtle-event', runId, seq: 1, event: { type: 'click', x: Infinity, y: 0, button: 1 } },
            { type: 'input', runId: '../other-user', seq: 1, text: 'x' },
        ]) assert.throws(() => protocol.validateIdeMessage(payload), errorCode('INVALID_MESSAGE'));
    });
    it('rejects forged unsafe drawing colors, commands, large arrays and truncated JSON', () => {
        assert.equal(protocol.parseGraphicsLine('{"type":"input","prompt":"名字"}').type, 'input-request');
        protocol.validateDrawing({ op: 'line', id: 1, turtle: 1, x1: 0, x2: 1, y1: 0, y2: 1, width: 1, color: '#ff0000' });
        for (const command of [
            { op: 'html', html: '<img src=x>' },
            { op: 'line', id: 1, turtle: 1, x1: 0, x2: 1, y1: 0, y2: 1, width: 1, color: 'url(https://evil)' },
            { op: 'remove', ids: Array(4097).fill(1) },
        ]) assert.throws(() => protocol.validateDrawing(command), errorCode('INVALID_MESSAGE'));
        assert.throws(() => protocol.parseGraphicsLine('{"type":'), errorCode('INVALID_MESSAGE'));
    });
    it('builds isolated argv without a shell and separates interactive input from graphics', () => {
        const command = runtimeModule.compileCommand('cc.cc17', 'int main(){}');
        assert.equal(command.args[0], '/usr/bin/python3'); assert(command.args.includes('/usr/bin/g++'));  assert(command.args.includes('-std=c++17'));
        assert.equal(command.copyIn['main.cpp'].content, 'int main(){}');
        assert.equal(command.memoryLimit, 256 * 1024 * 1024);
        const run = runtimeModule.executeCommand('py.py3', 'input()');
        assert.equal(run.files[0].streamIn, true); assert.equal(run.files[1].streamOut, true); assert.equal(run.tty, true);
        assert.equal(run.memoryLimit, 128 * 1024 * 1024); assert.equal(run.clockLimit, 1800e9);
        assert.throws(() => runtimeModule.ideSandboxUrl('file:///etc/passwd'), errorCode('UNAVAILABLE'));
    });
});

describe('cross-worker IDE execution quotas', () => {
    it('admits exactly four concurrent users, rejects a fifth, and reuses a confirmed stopped slot', async () => {
        const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, uid) => quota.acquireIdeLease(uid + 100, 4)));
        const accepted = outcomes.filter((result) => result.status === 'fulfilled').map((result) => result.value);
        assert.equal(accepted.length, 4);
        assert(outcomes.filter((result) => result.status === 'rejected').every((result) => result.reason.code === 'BUSY'));
        assert.equal(await database.collection('ide.lease').countDocuments(), 8);
        await accepted[0].release();
        const replacement = await quota.acquireIdeLease(200, 4);
        await Promise.all([...accepted, replacement].map((lease) => lease.release()));
        assert.equal(await database.collection('ide.lease').countDocuments(), 0);
    });
    it('allows only one simultaneous run for the same user across workers/tabs', async () => {
        const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => quota.acquireIdeLease(42, 2)));
        const accepted = outcomes.filter((result) => result.status === 'fulfilled');
        assert.equal(accepted.length, 1);
        assert(outcomes.filter((result) => result.status === 'rejected').every((result) => result.reason.code === 'ALREADY_RUNNING'));
        await accepted[0].value.release();
        const next = await quota.acquireIdeLease(42, 2); await next.release();
    });
    it('caps global jobs and releases failed user claims without stealing a live slot', async () => {
        const a = await quota.acquireIdeLease(1, 2); const b = await quota.acquireIdeLease(2, 2);
        await assert.rejects(quota.acquireIdeLease(3, 2), errorCode('BUSY'));
        assert.equal(await database.collection('ide.lease').countDocuments({ _id: 'user:3' }), 0);
        await a.release(); const c = await quota.acquireIdeLease(3, 2);
        await a.release(); assert.equal(await database.collection('ide.lease').countDocuments({ owner: c.owner }), 2);
        await b.release(); await c.release();
    });
    it('allows one compiler and another running program within the shared memory budget', async () => {
        const first = await quota.acquireIdeLease(1, 2, Date.now(), true);
        await assert.rejects(quota.acquireIdeLease(2, 2, Date.now(), true), errorCode('BUSY'));
        const python = await quota.acquireIdeLease(3, 2);
        await python.release(); await first.releaseCompilation();
        const second = await quota.acquireIdeLease(2, 2, Date.now(), true);
        await first.release(); await second.release();
    });
    it('reclaims only hard-expired leases, preserving orphaned-process capacity until its wall deadline', async () => {
        const now = Date.now(); const a = await quota.acquireIdeLease(7, 1, now);
        await assert.rejects(quota.acquireIdeLease(7, 1, now + 60000), errorCode('ALREADY_RUNNING'));
        const b = await quota.acquireIdeLease(7, 1, now + 1891000);
        await a.release(); assert.equal(await database.collection('ide.lease').countDocuments({ owner: b.owner }), 2);
        await b.release();
    });
});

function fakeClock() {
    let now = 0; let serial = 0; const timers = new Map();
    return { now: () => now, after(fn, ms) { const id = ++serial; timers.set(id, { at: now + ms, fn }); return id; },
        cancel(id) { timers.delete(id); },
        advance(ms) {
            const until = now + ms;
            while (true) {
                const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
                if (!next || next[1].at > until) break;
                timers.delete(next[0]); now = next[1].at; next[1].fn();
            }
            now = until;
        } };
}
describe('interactive IDE idle and execution protection', () => {
    it('stops after five minutes waiting, and duplicate wait messages or unchanged drafts do not extend it', () => {
        const clock = fakeClock(); const reasons = []; const guard = new watchdogModule.IdeWatchdog((r) => reasons.push(r), clock);
        guard.start(); guard.inputWaiting(true);
        clock.advance(240000); guard.inputActivity('甲', true);
        clock.advance(240000); guard.inputActivity('甲', true); guard.inputWaiting(true);
        clock.advance(59999); assert.equal(reasons.length, 0);
        clock.advance(1); assert.equal(reasons.length, 1); assert(reasons[0].includes('5 分钟'));
        clock.advance(1800000); assert.equal(reasons.length, 1);
    });
    it('accepts changed drafts and submitted input as activity, while empty input and unrelated drawing events do not renew', () => {
        const clock = fakeClock(); const reasons = []; const guard = new watchdogModule.IdeWatchdog((r) => reasons.push(r), clock);
        guard.start(); guard.inputWaiting(true);
        clock.advance(299000); guard.inputActivity('甲', true);
        clock.advance(299000); guard.inputActivity('甲乙', true);
        clock.advance(299000); guard.inputActivity('甲乙\n');
        clock.advance(299000); guard.inputActivity(''); guard.inputActivity('pointer-event', false, true);
        clock.advance(1000); assert.equal(reasons.length, 1);
    });
    it('charges active time cumulatively but permits normal turtle event waits and user input', () => {
        const clock = fakeClock(); const reasons = []; const guard = new watchdogModule.IdeWatchdog((r) => reasons.push(r), clock);
        guard.start(); clock.advance(70000);
        guard.interactionWaiting('events'); clock.advance(600000); assert.equal(reasons.length, 0);
        guard.interactionWaiting(null); clock.advance(30000);
        guard.inputWaiting(true); clock.advance(299000); guard.inputWaiting(false);
        clock.advance(19999); assert.equal(reasons.length, 0);
        clock.advance(1); assert.equal(reasons.length, 1); assert(reasons[0].includes('2 分钟'));
    });
    it('applies the same idle guard to turtle input dialogs without shortening ordinary mainloop waits', () => {
        const clock = fakeClock(); const reasons = []; const guard = new watchdogModule.IdeWatchdog((r) => reasons.push(r), clock);
        guard.start(); guard.interactionWaiting('events'); clock.advance(900000);
        guard.interactionWaiting('input'); clock.advance(290000); guard.inputActivity('答案', true);
        clock.advance(299999); assert.equal(reasons.length, 0);
        clock.advance(1); assert.equal(reasons.length, 1);
    });
    it('does not let background turtle callbacks renew an abandoned input dialog', () => {
        const clock = fakeClock(); const reasons = []; const guard = new watchdogModule.IdeWatchdog((r) => reasons.push(r), clock);
        guard.start(); guard.interactionWaiting('input');
        for (let i = 0; i < 29; i++) {
            clock.advance(9000); guard.interactionCallback(); clock.advance(1000); guard.interactionWaiting('input');
        }
        clock.advance(10000); assert.equal(reasons.length, 1); assert(reasons[0].includes('5 分钟'));
    });
    it('charges callbacks inside stdin waits and pauses again for nested input without renewing the idle deadline', () => {
        const clock = fakeClock(); const reasons = []; const guard = new watchdogModule.IdeWatchdog((r) => reasons.push(r), clock);
        guard.start(); guard.executionWaiting(true); guard.inputWaiting(true); clock.advance(50000);
        guard.executionWaiting(false); clock.advance(70000);
        guard.executionWaiting(true); clock.advance(50000);
        guard.executionWaiting(false); clock.advance(49999); assert.equal(reasons.length, 0);
        clock.advance(1); assert.equal(reasons.length, 1); assert(reasons[0].includes('2 分钟'));
    });
    it('removes both timers after completion or cancellation', () => {
        const clock = fakeClock(); const reasons = []; const guard = new watchdogModule.IdeWatchdog((r) => reasons.push(r), clock);
        guard.start(); guard.inputWaiting(true); guard.dispose();
        clock.advance(3600000); assert.equal(reasons.length, 0);
    });
});

async function fakeSandbox(onConnection, fn) {
    const server = new WebSocketServer({ port: 0 }); await new Promise((resolve) => server.once('listening', resolve));
    server.on('connection', (socket) => {
        socket.on('message', (frame) => { if (frame[0] === 1) socket.send(Buffer.concat([Buffer.from([2, 1]), Buffer.from('{\"ready\":true}\n')])); });
        onConnection(socket);
    });
    try { await fn(`http://127.0.0.1:${server.address().port}`); }
    finally { for (const ws of server.clients) ws.terminate(); await new Promise((resolve) => server.close(resolve)); }
}
const out = (socket, fd, text) => socket.send(Buffer.concat([Buffer.from([2, 1]), Buffer.from(JSON.stringify({fd,data:Buffer.from(text).toString('base64')})+'\n')]));
const end = (socket, extra = {}) => socket.send(Buffer.concat([Buffer.from([1]), Buffer.from(JSON.stringify({ results: [{ status: 'Accepted', exitStatus: 0, ...extra }] }))]));

describe('real WebSocket stream lifecycle', () => {
    it('automatically stops an abandoned stdin wait and immediately releases its quota on confirmed cancellation', async () => {
        const limits = { ...protocol, IDE_LIMITS: { ...protocol.IDE_LIMITS, inputIdleSeconds: 0.06 } };
        const watchdog = load('packages/hydrooj/src/lib/ide_watchdog.ts', { './ide_protocol': limits });
        const runtime = load('packages/hydrooj/src/lib/ide_runtime.ts', { './ide_protocol': limits, './ide_watchdog': watchdog });
        const events = []; let cancelled = false;
        await fakeSandbox((socket) => socket.on('message', (frame) => {
            if (frame[0] === 1) out(socket, 3, '{"type":"input"}\n');
            if (frame[0] === 4) { cancelled = true; end(socket, { status: 'Signalled', exitStatus: 9 }); }
        }), async (host) => {
            const lease = await quota.acquireIdeLease(1, 1);
            const job = new runtime.IdeRuntime(runId, host, (event) => events.push(event));
            await job.start('py.py3', 'input()');
            assert(cancelled); assert(job.safeToRelease); await lease.release();
            const next = await quota.acquireIdeLease(2, 1); await next.release();
            assert.equal(events.at(-1).status, 'stopped'); assert(events.at(-1).reason.includes('5 分钟'));
        });
    });
    it('streams split UTF-8/JSONL, preserves event ordering and deduplicates stdin seq', async () => {
        let peer; const inputs = []; const events = [];
        await fakeSandbox((socket) => {
            peer = socket;
            socket.on('message', (frame) => {
                if (frame[0] === 1) {
                    const bytes = Buffer.from('你好'); out(socket, 1, bytes.subarray(0, 2)); out(socket, 1, bytes.subarray(2));
                    out(socket, 3, '{"type":"input","prompt":'); out(socket, 3, '"继续"}\n');
                } else if (frame[0] === 3) inputs.push(Buffer.from(JSON.parse(frame.subarray(2).toString()).data,'base64').toString());
            });
        }, async (host) => {
            const runtime = new runtimeModule.IdeRuntime(runId, host, (message) => events.push(message));
            const completed = runtime.start('py.py3', 'input()');
            await waitFor(() => events.some((event) => event.type === 'input-request'));
            runtime.input(1, 'hello\n'); runtime.input(1, 'hello\n'); runtime.input(2, 'next\n');
            runtime.inputDraft(3, '草稿'); runtime.input(3, 'duplicate\n');
            await waitFor(() => inputs.length === 2); end(peer); await completed;
            assert.equal(events.filter((event) => event.type === 'output').map((event) => event.text).join(''), '你好');
            assert.deepEqual(inputs, ['hello\n', 'next\n']);
            assert(events.every((event, index) => event.seq === index)); assert.equal(events.at(-1).status, 'finished');
            assert.equal(runtime.safeToRelease, true);
        });
    });
    it('stops immediately without blocking input handlers and confirms cancellation before releasing quota', async () => {
        let cancelled = false; const events = [];
        await fakeSandbox((socket) => socket.on('message', (frame) => {
            if (frame[0] === 4) { cancelled = true; end(socket, { status: 'Signalled', exitStatus: 9 }); }
        }), async (host) => {
            const runtime = new runtimeModule.IdeRuntime(runId, host, (event) => events.push(event));
            const done = runtime.start('py.py3', 'while True: pass');
            await waitFor(() => events.some((event) => event.state === 'running')); runtime.stop(); await done;
            assert(cancelled); assert.equal(events.at(-1).status, 'stopped'); assert.equal(runtime.safeToRelease, true);
        });
    });
    it('rejects graphics injection and requests cancellation rather than relaying unsafe content', async () => {
        let cancelled = false; const events = [];
        await fakeSandbox((socket) => socket.on('message', (frame) => {
            if (frame[0] === 1) out(socket, 3, '{"type":"draw","command":{"op":"html","html":"bad"}}\n');
            if (frame[0] === 4) { cancelled = true; end(socket, { status: 'Signalled', exitStatus: 9 }); }
        }), async (host) => {
            const runtime = new runtimeModule.IdeRuntime(runId, host, (event) => events.push(event)); await runtime.start('py.py3', 'pass');
            assert(cancelled); assert.equal(events.filter((event) => event.type === 'turtle').length, 0); assert(runtime.safeToRelease);
        });
    });
    it('cancels an output flood without forwarding its excess data', async () => {
        let cancelled = false; const events = [];
        await fakeSandbox((socket) => socket.on('message', (frame) => {
            if (frame[0] === 1) for (let i = 0; i < 34; i++) out(socket, 1, 'x'.repeat(65536));
            if (frame[0] === 4) { cancelled = true; end(socket, { status: 'Signalled', exitStatus: 9 }); }
        }), async (host) => {
            const runtime = new runtimeModule.IdeRuntime(runId, host, (event) => events.push(event)); await runtime.start('py.py3', 'pass');
            assert(cancelled); assert(events.filter((e) => e.type === 'output').reduce((n, e) => n + e.text.length, 0) <= protocol.IDE_LIMITS.outputBytes);
            assert(runtime.safeToRelease);
        });
    });
    it('keeps orphaned-process quotas on an unconfirmed disconnect', async () => {
        const events = [];
        await fakeSandbox((socket) => socket.on('message', (frame) => {
            if (frame[0] === 1) socket.terminate();
        }), async (host) => {
            const runtime = new runtimeModule.IdeRuntime(runId, host, (event) => events.push(event)); await runtime.start('py.py3', 'pass');
            assert.equal(runtime.safeToRelease, false); assert.equal(events.at(-1).status, 'failed');
        });
    });
});

const PERM = { PERM_SUBMIT_PROBLEM: 1n, PERM_EDIT_DOMAIN: 2n, PERM_ALL: 3n };
const PRIV = { PRIV_USER_PROFILE: 2, PRIV_EDIT_SYSTEM: 4 };
describe('IDE account, classroom and language authorization', () => {
    let handler; let login; let account; let member; let classroom; let allowed; let revoked; let runs; let releases; let jobs;
    beforeEach(() => {
        login = { uid: 42, scope: '1', expireAt: new Date(Date.now() + 60000) };
        account = { _id: 42, priv: 2 }; member = { perm: 1n }; classroom = { _id: 'class-a', domainType: 'oj', langs: 'py.py3,cc.cc17' };
        allowed = ['py.py3']; revoked = false; runs = 0; releases = 0; jobs = [];
        class Job {
            safeToRelease = true;
            constructor(id, host, emit) { this.runId = id; this.emit = emit; jobs.push(this); }
            async start(lang, code) { runs++; this.lang = lang; this.code = code; const waiting = new Promise((resolve) => { this.done = resolve; }); this.emit({ type: 'state', state: 'running' }); return waiting; }
            stop() { this.stopped = true; this.done(); }
            input() { this.inputs = (this.inputs || 0) + 1; }
            inputDraft() { this.drafts = (this.drafts || 0) + 1; }
        }
        const dependencies = {
            '../lib/live_share': { checkShareOrigin: (origin, host) => { if (origin !== `https://${host}`) throw new Error('Wrong origin'); } },
            '../lib/ide_protocol': protocol,
            '../lib/ide_runtime': { ...runtimeModule, IdeRuntime: Job },
            '../lib/ide_quota': { ...quota, acquireIdeLease: async () => ({ revision: 0, release: async () => { releases++; } }) },
            '../lib/student_submission_language': { getStudentSubmissionLanguages: () => allowed },
            '../model/builtin': { PERM, PRIV }, '../model/domain': { get: async () => classroom, getDomainUser: async () => member },
            '../model/live_share': { teacherScope: async () => { throw new Error('Not teacher'); }, studentScope: async () => { if (revoked) throw new Error('Revoked'); } },
            '../model/setting': { langs: { 'py.py3': {}, 'cc.cc17': {} } }, '../model/system': { get: () => undefined },
            '../model/token': { TYPE_SESSION: 0, get: async () => login }, '../model/user': { coll: { findOne: async () => account } },
            '../service/server': { ConnectionHandler: class {}, Handler: class {} },
            '../model/workspace': { LEGACY_WORKSPACE_ID: 'tang', isPlatformAdmin: () => false, isLegacyOwner: () => false },
        };
        const { IdeRuntimeConnectionHandler } = load('packages/hydrooj/src/handler/ide_runtime.ts', dependencies);
        handler = Object.assign(new IdeRuntimeConnectionHandler(), {
            user: { _id: 42 }, domain: classroom, session: { _id: 'login' },
            request: { host: 'school.test', headers: { origin: 'https://school.test' } },
            ctx: { interval(fn, ms) { handler[ms === 1000 ? 'resetHeartbeat' : 'heartbeat'] = fn; } }, conn: { bufferedAmount: 0 }, sent: [],
            checkPriv() {}, checkPerm() {}, limitRate: async () => {}, send(message) { this.sent.push(message); },
            close() { this.closed = true; },
        });
    });
    it('rejects sudo, cross-origin, expired login, different users and removed membership', async () => {
        handler.session.sudoUid = 8; await assert.rejects(handler.prepare()); handler.session.sudoUid = undefined;
        handler.request.headers.origin = 'https://evil.test'; await assert.rejects(handler.prepare()); handler.request.headers.origin = 'https://school.test';
        login.uid = 43; await assert.rejects(handler.prepare()); login.uid = 42;
        login.expireAt = new Date(0); await assert.rejects(handler.prepare()); login.expireAt = new Date(Date.now() + 60000);
        revoked = true; await assert.rejects(handler.prepare()); assert.equal(runs, 0);
    });
    it('wraps authorized beginner C++ bodies including an empty body, while preserving complete main programs', async () => {
        account.cppEditorMode = 'beginner'; allowed = ['cc.cc17']; await handler.prepare();
        const body = 'int n;\r\ncin >> n;\r\ncout << n + 1;';
        await handler.message({ type: 'run', runId, lang: 'cc.cc17', code: body, cppEditorMode: 'proficient' });
        assert(jobs[0].code.startsWith('#include<bits/stdc++.h>\nusing namespace std;\nint main(){\n'));
        assert(jobs[0].code.includes('int n;\ncin >> n;\ncout << n + 1;')); assert(jobs[0].code.endsWith('    return 0;\n}\n'));
        await handler.message({ type: 'stop', runId }); await waitFor(() => releases === 1);
        const full = '#include<iostream>\nint main(){std::cout<<42;}';
        await handler.message({ type: 'run', runId: `${runId}-full`, lang: 'cc.cc17', code: full });
        assert.equal(jobs[1].code, full); await handler.cleanup(); await waitFor(() => releases === 2);
    });
    it('uses legacy beginner preference only when no account preference is set, and never changes Python', async () => {
        member.cppEditorMode = 'beginner'; allowed = ['cc.cc17', 'py.py3']; await handler.prepare();
        await handler.message({ type: 'run', runId, lang: 'cc.cc17', code: '' });
        assert(jobs[0].code.includes('int main(){')); await handler.message({ type: 'stop', runId }); await waitFor(() => releases === 1);
        account.cppEditorMode = 'proficient';
        await handler.message({ type: 'run', runId: `${runId}-own`, lang: 'cc.cc17', code: 'cout << 1;', cppEditorMode: 'beginner' });
        assert.equal(jobs[1].code, 'cout << 1;'); await handler.message({ type: 'stop', runId: `${runId}-own` }); await waitFor(() => releases === 2);
        account.cppEditorMode = 'beginner';
        await handler.message({ type: 'run', runId: `${runId}-py`, lang: 'py.py3', code: 'print(1)' });
        assert.equal(jobs[2].code, 'print(1)'); await handler.cleanup(); await waitFor(() => releases === 3);
    });
    it('does not mistake a C++ main mentioned in comments or strings for a complete program', async () => {
        account.cppEditorMode = 'beginner'; allowed = ['cc.cc17']; await handler.prepare();
        const bodies = ['// int main() {}\ncout<<1;', '/* signed main() {} */ cout<<2;',
            'string s="int main() {}"; cout<<s;', 'string s=R"text(auto main() {})text"; cout<<s;',
            '#define EXAMPLE int main()\ncout<<3;'];
        for (const [index, body] of bodies.entries()) {
            const id = `${runId}-lex-${index}`;
            await handler.message({ type: 'run', runId: id, lang: 'cc.cc17', code: body });
            assert(jobs[index].code.startsWith('#include<bits/stdc++.h>\nusing namespace std;\nint main(){\n'));
            assert(jobs[index].code.includes(body));
            await handler.message({ type: 'stop', runId: id }); await waitFor(() => releases === index + 1);
        }
        const full = '#include<iostream>\nint /* actual entry */ main(){std::cout<<1;}';
        await handler.message({ type: 'run', runId: `${runId}-comment-main`, lang: 'cc.cc17', code: full });
        assert.equal(jobs.at(-1).code, full); await handler.cleanup();
    });
    it('does not let beginner mode bypass classroom language restrictions, Scratch isolation or the source byte limit', async () => {
        account.cppEditorMode = 'beginner'; await handler.prepare();
        await handler.message({ type: 'run', runId, lang: 'cc.cc17', code: 'cout<<1;' });
        assert.equal(handler.sent.at(-1).code, 'FORBIDDEN'); assert.equal(runs, 0);
        allowed = ['cc.cc17'];
        await handler.message({ type: 'run', runId, lang: 'cc.cc17', code: ' '.repeat(protocol.IDE_LIMITS.codeBytes) });
        assert.equal(handler.sent.at(-1).code, 'CODE_LIMIT'); assert.equal(runs, 0);
        classroom.domainType = 'scratch';
        await handler.message({ type: 'run', runId, lang: 'cc.cc17', code: 'cout<<1;' });
        assert.equal(handler.sent.at(-1).code, 'FORBIDDEN'); assert.equal(runs, 0);
    });
    it('runs the authorized beginner body through the real C++ compiler and interactive stdin', { skip: !process.env.IDE_SANDBOX_TEST_URL }, async () => {
        account.cppEditorMode = 'beginner'; allowed = ['cc.cc17']; await handler.prepare();
        await handler.message({ type: 'run', runId, lang: 'cc.cc17', code: 'int n; cin >> n; cout << n + 1 << endl;' });
        const events = []; let sent = false;
        const runtime = new runtimeModule.IdeRuntime(`${runId}-real`, process.env.IDE_SANDBOX_TEST_URL, (event) => {
            events.push(event);
            if (event.type === 'input-request' && !sent) { sent = true; runtime.input(0, '41\n'); }
        });
        const timeout = setTimeout(() => runtime.stop('Test timeout'), 15000);
        try { await runtime.start(jobs[0].lang, jobs[0].code); }
        finally { clearTimeout(timeout); await handler.cleanup(); }
        assert(sent); assert(runtime.safeToRelease); assert.equal(events.at(-1).status, 'finished');
        assert.equal(events.filter((event) => event.type === 'output').map((event) => event.text).join('').trim(), '42');
    });
    it('retains teacher language restrictions and replay-proof run ownership', async () => {
        await handler.prepare();
        await handler.message({ type: 'run', runId, lang: 'cc.cc17', code: '' });
        assert.equal(handler.sent.at(-1).code, 'FORBIDDEN'); assert.equal(runs, 0);
        await handler.message({ type: 'run', runId, lang: 'py.py3', code: 'input()' });
        await handler.message({ type: 'run', runId, lang: 'py.py3', code: 'other()' }); assert.equal(runs, 1);
        await handler.message({ type: 'input', runId: 'another-run-0000000', seq: 1, text: 'x' }); assert.equal(jobs[0].inputs, undefined);
        await handler.message({ type: 'input-draft', runId: 'another-run-0000000', seq: 1, text: '草稿' }); assert.equal(jobs[0].drafts, undefined);
        await handler.message({ type: 'input-draft', runId, seq: 2, text: '草稿' }); assert.equal(jobs[0].drafts, 1);
        await handler.message({ type: 'stop', runId }); await waitFor(() => releases === 1);
        await handler.message({ type: 'run', runId, lang: 'py.py3', code: 'again()' }); assert.equal(runs, 1);
    });
    it('kills active runs on account revocation and on page disconnect', async () => {
        await handler.prepare(); await handler.message({ type: 'run', runId, lang: 'py.py3', code: '' });
        login.expireAt = new Date(0); handler.heartbeat(); await waitFor(() => handler.closed); assert(jobs[0].stopped);
        await waitFor(() => releases === 1);
    });
    it('closes slow consumers instead of buffering unbounded output', async () => {
        await handler.prepare(); handler.conn.bufferedAmount = 600 * 1024;
        await handler.message({ type: 'run', runId, lang: 'py.py3', code: '' });
        assert(handler.closed); assert(jobs[0].stopped);
    });
});

describe('IDE capacity and reset gate across workers', () => {
    it('counts slots once, ignores expired leases, and exposes no other learner information', async () => {
        const a = await quota.acquireIdeLease(42, 4, Date.now(), true);
        const b = await quota.acquireIdeLease(99, 4);
        await database.collection('ide.lease').insertOne({ _id: 'slot:15', owner: 'expired', expiresAt: new Date(0) });
        const status = await quota.getIdeCapacity(42, 4);
        assert.deepEqual(JSON.parse(JSON.stringify(status)), { capacity: 4, used: 2, available: 2, compilerBusy: true, ownRunning: true, resetting: false });
        assert.equal((await quota.getIdeCapacity(7, 1)).available, 0);
        assert.equal((await quota.getIdeCapacity(7, 1)).used, 2);
        assert(!JSON.stringify(status).includes('99'));
        await a.release(); await b.release();
    });
    it('fences incoming runs, joins concurrent resets, and reopens only after confirmed claims are released', async () => {
        const a = await quota.acquireIdeLease(1, 4); const b = await quota.acquireIdeLease(2, 4);
        const resets = await Promise.all(Array.from({ length: 8 }, () => quota.requestIdeReset(42)));
        assert(resets.every((control) => control.revision === 1 && control.resetting));
        await assert.rejects(quota.acquireIdeLease(3, 4), errorCode('RESETTING'));
        await a.release(); assert((await quota.finishIdeReset()).resetting);
        assert.equal((await quota.getIdeCapacity(42, 4)).available, 0);
        await b.release(); assert.equal((await quota.finishIdeReset()).resetting, false);
        const next = await quota.acquireIdeLease(3, 4); assert.equal(next.revision, 1); await next.release();
    });
    it('rejects a delayed old acquire even when an empty reset has already completed', async () => {
        const original = quota.leases.findOneAndUpdate.bind(quota.leases); let interrupted = false;
        quota.leases.findOneAndUpdate = async (...args) => {
            if (!interrupted) {
                interrupted = true; await quota.requestIdeReset(42);
                assert.equal((await quota.finishIdeReset()).resetting, false);
            }
            return original(...args);
        };
        try { await assert.rejects(quota.acquireIdeLease(55, 4), errorCode('RESETTING')); }
        finally { quota.leases.findOneAndUpdate = original; }
        assert.equal(await quota.leases.countDocuments(), 0);
        assert.equal((await quota.getIdeControl()).revision, 1);
    });
    it('rejects a reset racing the persisted slot before the final gate read', async () => {
        const original = quota.leases.findOneAndUpdate.bind(quota.leases); let interrupted = false;
        quota.leases.findOneAndUpdate = async (...args) => {
            const result = await original(...args);
            if (args[0]._id === 'slot:0' && !interrupted) {
                interrupted = true; await quota.requestIdeReset(42);
                assert((await quota.finishIdeReset()).resetting);
            }
            return result;
        };
        try { await assert.rejects(quota.acquireIdeLease(55, 4), errorCode('RESETTING')); }
        finally { quota.leases.findOneAndUpdate = original; }
        assert.equal(await quota.leases.countDocuments(), 0);
        assert.equal((await quota.finishIdeReset()).resetting, false);
    });
    it('retains unknown orphaned capacity until its hard process deadline rather than claiming success', async () => {
        const now = Date.now(); await quota.acquireIdeLease(55, 4, now);
        await quota.requestIdeReset(42, now);
        assert((await quota.finishIdeReset(now + 60000)).resetting);
        const busy = await quota.getIdeCapacity(42, 4, now + 60000);
        assert.equal(busy.used, 1); assert.equal(busy.available, 0);
        assert.equal((await quota.finishIdeReset(now + 1891000)).resetting, false);
        assert.equal((await quota.getIdeCapacity(42, 4, now + 1891000)).used, 0);
    });
});

describe('IDE status/reset HTTP authorization and live cancellation', () => {
    let handlers; let accounts; let logins; let teachers; let platforms; let legacyOwners; let revoked; let jobs; let classes; let sharedDeps; let acquire;
    beforeEach(() => {
        accounts = new Map(); logins = new Map(); teachers = new Map(); platforms = new Set(); legacyOwners = new Set(); revoked = new Set(); jobs = [];
        classes = new Map([['class-a', { _id: 'class-a', domainType: 'oj', workspaceId: 'tang' }],
            ['class-b', { _id: 'class-b', domainType: 'oj', workspaceId: 'tenant-b' }]]);
        acquire = (...args) => quota.acquireIdeLease(...args);
        class Job {
            safeToRelease = true;
            constructor(id, host, emit) { this.runId = id; this.emit = emit; jobs.push(this); }
            async start() { return new Promise((resolve) => { this.confirm = resolve; }); }
            stop(reason) { this.stopReason = reason; this.stopped = true; }
        }
        sharedDeps = {
            '../lib/live_share': { checkShareOrigin: (origin, host) => { if (!origin || new URL(origin).host !== host) throw new Error('Origin'); } },
            '../lib/ide_protocol': protocol, '../lib/ide_runtime': { ...runtimeModule, IdeRuntime: Job },
            '../lib/ide_quota': { ...quota, acquireIdeLease: (...args) => acquire(...args) },
            '../lib/student_submission_language': { getStudentSubmissionLanguages: () => ['py.py3'] },
            '../model/builtin': { PERM, PRIV },
            '../model/domain': { get: async (id) => classes.get(id), getDomainUser: async () => ({ perm: 3n }) },
            '../model/live_share': {
                teacherScope: async (uid) => { if (revoked.has(uid) || !teachers.has(uid)) throw new Error('Not teacher'); return { workspaceId: teachers.get(uid) }; },
                studentScope: async (uid) => { if (revoked.has(uid) || teachers.has(uid)) throw new Error('Not student'); return {}; },
            },
            '../model/setting': { langs: { 'py.py3': {} } }, '../model/system': { get: () => undefined },
            '../model/token': { TYPE_SESSION: 0, get: async (id) => logins.get(id) },
            '../model/user': { coll: { findOne: async ({ _id }) => accounts.get(_id) } },
            '../model/workspace': { LEGACY_WORKSPACE_ID: 'tang', isPlatformAdmin: (uid) => platforms.has(uid), isLegacyOwner: (uid) => legacyOwners.has(uid) },
            '../service/server': { ConnectionHandler: class {}, Handler: class {} },
        };
        handlers = load('packages/hydrooj/src/handler/ide_runtime.ts', sharedDeps);
    });
    function setup(Class, uid = 42, classroom = 'class-a') {
        if (!accounts.has(uid)) accounts.set(uid, { _id: uid, priv: PRIV.PRIV_USER_PROFILE });
        if (!logins.has(`${uid}`)) logins.set(`${uid}`, { uid, scope: '3', expireAt: new Date(Date.now() + 60000) });
        const item = Object.assign(new Class(), {
            user: { _id: uid }, domain: classes.get(classroom), session: { _id: `${uid}` },
            request: { host: 'school.test', headers: { origin: 'https://school.test', 'sec-fetch-site': 'same-origin' } },
            response: { status: 200, headers: {}, addHeader(key, value) { this.headers[key] = value; } },
            conn: { bufferedAmount: 0 }, sent: [], checkPriv() {}, checkPerm() {}, limitRate: async () => {}, send(message) { this.sent.push(message); }, close() {},
        });
        item.ctx = { interval(fn, ms) { item[ms === 1000 ? 'resetHeartbeat' : 'heartbeat'] = fn; } };
        return item;
    }
    it('permits authenticated read-only status, rejects students and other tenant teachers from global reset', async () => {
        const student = setup(handlers.IdeCapacityHandler);
        delete student.request.headers.origin; await student.get();
        assert.equal(student.response.status, 200); assert.equal(student.response.body.canRelease, false);
        assert.equal(student.response.headers['Cache-Control'], 'private, no-store');
        const forbidden = setup(handlers.IdeReleaseHandler); await forbidden.post(); assert.equal(forbidden.response.status, 403);
        teachers.set(99, 'tenant-b');
        const other = setup(handlers.IdeReleaseHandler, 99, 'class-b'); await other.post(); assert.equal(other.response.status, 403);
        assert.equal((await quota.getIdeControl()).revision, 0);
    });
    it('checks current admin authority, teacher membership, session scope, login and Origin on every reset', async () => {
        teachers.set(42, 'tang'); platforms.add(42);
        const item = setup(handlers.IdeReleaseHandler); await item.get(); assert.equal(item.response.body.canRelease, true);
        platforms.delete(42); await item.post(); assert.equal(item.response.status, 403);
        platforms.add(42); revoked.add(42); await item.post(); assert.equal(item.response.status, 403); revoked.clear();
        logins.get('42').scope = '1'; await item.post(); assert.equal(item.response.status, 403); logins.get('42').scope = '3';
        item.session.sudoUid = 7; await item.post(); assert.equal(item.response.status, 403); delete item.session.sudoUid;
        logins.get('42').expireAt = new Date(0); await item.post(); assert.equal(item.response.status, 403); logins.get('42').expireAt = new Date(Date.now() + 60000);
        item.request.headers.origin = 'https://evil.test'; await item.post(); assert.equal(item.response.status, 403);
        delete item.request.headers.origin; await item.post(); assert.equal(item.response.status, 403);
        item.request.headers.origin = 'https://school.test'; item.request.headers['sec-fetch-site'] = 'same-site'; await item.post(); assert.equal(item.response.status, 403);
        assert.equal((await quota.getIdeControl()).revision, 0);
    });
    it('allows the legacy owner/system administrator only with fresh teacher access to the legacy workspace', async () => {
        teachers.set(42, 'tang'); legacyOwners.add(42);
        const owner = setup(handlers.IdeCapacityHandler); await owner.get(); assert.equal(owner.response.body.canRelease, true);
        legacyOwners.clear(); accounts.get(42).priv |= PRIV.PRIV_EDIT_SYSTEM; await owner.get(); assert.equal(owner.response.body.canRelease, true);
        teachers.set(42, 'tenant-b'); owner.domain = classes.get('class-b'); await owner.get(); assert.equal(owner.response.body.canRelease, false);
    });
    it('stops all active worker connections, preserves claims until confirmed exit, and leaves non-IDE data alone', async () => {
        const workerA = setup(handlers.IdeRuntimeConnectionHandler, 1); const workerB = setup(handlers.IdeRuntimeConnectionHandler, 2, 'class-b');
        await workerA.prepare(); await workerB.prepare();
        await workerA.message({ type: 'run', runId: `${runId}-a`, lang: 'py.py3', code: 'input()' });
        await workerB.message({ type: 'run', runId: `${runId}-b`, lang: 'py.py3', code: 'input()' });
        await database.collection('task').insertOne({ _id: 'judge-running', type: 'judge' });
        teachers.set(42, 'tang'); platforms.add(42);
        const reset = setup(handlers.IdeReleaseHandler); await reset.post();
        assert(reset.response.body.resetting); assert.equal(reset.response.body.used, 2);
        await Promise.all([workerA.resetHeartbeat(), workerB.resetHeartbeat()]);
        assert(jobs.every((job) => job.stopped)); assert.equal((await quota.getIdeCapacity(42, 4)).used, 2);
        jobs[0].confirm(); await waitFor(() => !workerA.current);
        assert((await quota.finishIdeReset()).resetting);
        jobs[1].confirm(); await waitFor(() => !workerB.current);
        await waitFor(async () => await quota.leases.countDocuments() === 0);
        const final = await quota.getIdeCapacity(42, 4); assert.equal(final.used, 0); assert.equal(final.resetting, false);
        assert.equal(await database.collection('task').countDocuments({ _id: 'judge-running' }), 1);
        await database.collection('task').deleteMany({});
    });
    it('also cancels a runtime registered just after reset begins, after its final acquire gate had passed', async () => {
        let releaseAcquire; let claimed;
        const hasClaimed = new Promise((resolve) => { claimed = resolve; });
        const paused = new Promise((resolve) => { releaseAcquire = resolve; });
        acquire = async (...args) => { const lease = await quota.acquireIdeLease(...args); claimed(); await paused; return lease; };
        const worker = setup(handlers.IdeRuntimeConnectionHandler, 7); await worker.prepare();
        const starting = worker.message({ type: 'run', runId, lang: 'py.py3', code: 'input()' }); await hasClaimed;
        await quota.requestIdeReset(42); assert((await quota.finishIdeReset()).resetting);
        releaseAcquire(); await starting; assert.equal(jobs.length, 1);
        await worker.resetHeartbeat(); assert(jobs[0].stopped); jobs[0].confirm();
        await waitFor(async () => await quota.leases.countDocuments() === 0);
        assert.equal((await quota.getIdeCapacity(42, 4)).resetting, false);
    });
    it('cancels four real isolated input programs through the cross-worker reset gate', { skip: !process.env.IDE_SANDBOX_TEST_URL }, async () => {
        const real = load('packages/hydrooj/src/handler/ide_runtime.ts', { ...sharedDeps,
            '../lib/ide_runtime': runtimeModule,
            '../model/system': { get: (key) => key === 'ide.sandboxHost' ? process.env.IDE_SANDBOX_TEST_URL : undefined },
        });
        const workers = [101, 102, 103, 104].map((uid) => setup(real.IdeRuntimeConnectionHandler, uid));
        try {
            await Promise.all(workers.map((worker) => worker.prepare()));
            await Promise.all(workers.map((worker, i) => worker.message({ type: 'run', runId: `${runId}-real-${i}`,
                lang: 'py.py3', code: 'memory=bytearray(4*1024*1024)\ninput()' })));
            await waitFor(() => workers.every((worker) => worker.sent.some((event) => event.type === 'input-request')), 15000);
            const before = await quota.getIdeCapacity(42, 4); assert.equal(before.used, 4); assert.equal(before.available, 0);
            teachers.set(42, 'tang'); platforms.add(42);
            const teacher = setup(real.IdeReleaseHandler); await teacher.post(); assert(teacher.response.body.resetting);
            await Promise.all(workers.map((worker) => worker.resetHeartbeat()));
            await waitFor(async () => await quota.leases.countDocuments() === 0, 15000);
            const after = await quota.getIdeCapacity(42, 4); assert.equal(after.used, 0); assert.equal(after.available, 4); assert.equal(after.resetting, false);
            assert(workers.every((worker) => worker.sent.some((event) => event.type === 'exit' && event.status === 'stopped'
                && event.reason.includes('老师已停止'))));
            const next = await quota.acquireIdeLease(105, 4); await next.release();
        } finally { await Promise.all(workers.map((worker) => worker.cleanup())); }
    });
    it('retains an unconfirmed disconnected process claim during a global reset', async () => {
        const worker = setup(handlers.IdeRuntimeConnectionHandler, 7); await worker.prepare();
        await worker.message({ type: 'run', runId, lang: 'py.py3', code: 'input()' });
        await quota.requestIdeReset(42); await worker.resetHeartbeat(); jobs[0].safeToRelease = false; jobs[0].confirm();
        await waitFor(() => !worker.current); const status = await quota.getIdeCapacity(42, 4);
        assert.equal(status.used, 1); assert(status.resetting); assert.equal(status.available, 0);
    });
});
