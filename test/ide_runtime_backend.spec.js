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
const runtimeModule = load('packages/hydrooj/src/lib/ide_runtime.ts', { './ide_protocol': protocol });
const errorCode = (code) => (error) => error.code === code;
const runId = 'runtime-test-0123456789';
const waitFor = async (predicate) => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 10)); }
    throw new Error('Timed out waiting');
};
let mongo; let client; let database; let quota;
before(async () => {
    mongo = await MongoMemoryServer.create(); client = await MongoClient.connect(mongo.getUri()); database = client.db('ide');
    quota = load('packages/hydrooj/src/lib/ide_quota.ts', { '../service/db': { collection: (name) => database.collection(name) }, './ide_protocol': protocol });
});
after(async () => { await client?.close(); await mongo?.stop(); });
beforeEach(async () => { await database.collection('ide.lease').deleteMany({}); });

describe('interactive IDE trust boundary', () => {
    it('accepts only fixed languages, bounded code/input and validated graphical events', () => {
        protocol.validateIdeMessage({ type: 'run', runId, lang: 'py.py3', code: 'print(1)' });
        protocol.validateIdeMessage({ type: 'turtle-event', runId, seq: 0, event: { type: 'click', x: 0, y: 1, button: 1 } });
        for (const payload of [
            { type: 'run', runId, lang: '__proto__', code: 'echo hello' },
            { type: 'run', runId, lang: 'bash', code: 'id' },
            { type: 'run', runId, lang: 'py.py3', code: '中'.repeat(60000) },
            { type: 'input', runId, seq: 1, text: '\0' },
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

const PERM = { PERM_SUBMIT_PROBLEM: 1n, PERM_ALL: 1n };
const PRIV = { PRIV_USER_PROFILE: 2 };
describe('IDE account, classroom and language authorization', () => {
    let handler; let login; let account; let classroom; let allowed; let revoked; let runs; let releases; let jobs;
    beforeEach(() => {
        login = { uid: 42, scope: '1', expireAt: new Date(Date.now() + 60000) };
        account = { _id: 42, priv: 2 }; classroom = { _id: 'class-a', domainType: 'oj', langs: 'py.py3,cc.cc17' };
        allowed = ['py.py3']; revoked = false; runs = 0; releases = 0; jobs = [];
        class Job {
            safeToRelease = true;
            constructor(id, host, emit) { this.runId = id; this.emit = emit; jobs.push(this); }
            async start() { runs++; const waiting = new Promise((resolve) => { this.done = resolve; }); this.emit({ type: 'state', state: 'running' }); return waiting; }
            stop() { this.stopped = true; this.done(); }
            input() { this.inputs = (this.inputs || 0) + 1; }
        }
        const dependencies = {
            '../lib/live_share': { checkShareOrigin: (origin, host) => { if (origin !== `https://${host}`) throw new Error('Wrong origin'); } },
            '../lib/ide_protocol': protocol,
            '../lib/ide_runtime': { ...runtimeModule, IdeRuntime: Job },
            '../lib/ide_quota': { acquireIdeLease: async () => ({ release: async () => { releases++; } }) },
            '../lib/student_submission_language': { getStudentSubmissionLanguages: () => allowed },
            '../model/builtin': { PERM, PRIV }, '../model/domain': { get: async () => classroom, getDomainUser: async () => ({ perm: 1n }) },
            '../model/live_share': { teacherScope: async () => { throw new Error('Not teacher'); }, studentScope: async () => { if (revoked) throw new Error('Revoked'); } },
            '../model/setting': { langs: { 'py.py3': {}, 'cc.cc17': {} } }, '../model/system': { get: () => undefined },
            '../model/token': { TYPE_SESSION: 0, get: async () => login }, '../model/user': { coll: { findOne: async () => account } },
            '../service/server': { ConnectionHandler: class {} },
        };
        const { IdeRuntimeConnectionHandler } = load('packages/hydrooj/src/handler/ide_runtime.ts', dependencies);
        handler = Object.assign(new IdeRuntimeConnectionHandler(), {
            user: { _id: 42 }, domain: classroom, session: { _id: 'login' },
            request: { host: 'school.test', headers: { origin: 'https://school.test' } },
            ctx: { interval(fn) { handler.heartbeat = fn; } }, conn: { bufferedAmount: 0 }, sent: [],
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
    it('retains teacher language restrictions and replay-proof run ownership', async () => {
        await handler.prepare();
        await handler.message({ type: 'run', runId, lang: 'cc.cc17', code: '' });
        assert.equal(handler.sent.at(-1).code, 'FORBIDDEN'); assert.equal(runs, 0);
        await handler.message({ type: 'run', runId, lang: 'py.py3', code: 'input()' });
        await handler.message({ type: 'run', runId, lang: 'py.py3', code: 'other()' }); assert.equal(runs, 1);
        await handler.message({ type: 'input', runId: 'another-run-0000000', seq: 1, text: 'x' }); assert.equal(jobs[0].inputs, undefined);
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
