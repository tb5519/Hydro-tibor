/** Run only against a dedicated IDE sandbox: IDE_SANDBOX_TEST_URL=http://127.0.0.1:15050 node --test this-file */
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const { randomUUID } = require('node:crypto'); const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const host = process.env.IDE_SANDBOX_TEST_URL;
const base = path.resolve(__dirname, '../packages/hydrooj/src/lib');
function load(name, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(base, name), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module, exports: module.exports, Buffer, URL, Date, process, console, fetch, AbortSignal, setTimeout, clearTimeout,
            __dirname: base, require: (key) => dependencies[key] ?? require(key) });
    return module.exports;
}
const protocol = load('ide_protocol.ts');
const watchdog = load('ide_watchdog.ts', { './ide_protocol': protocol });
const { IdeRuntime } = load('ide_runtime.ts', { './ide_protocol': protocol, './ide_watchdog': watchdog });
async function run(lang, code, onEvent = () => {}, Runtime = IdeRuntime) {
    const events = []; let seq = 0; let runtime;
    runtime = new Runtime(randomUUID(), host, (event) => {
        events.push(event);
        onEvent(event, { input: (text) => runtime.input(seq++, text),
            turtle: (value) => runtime.input(seq++, `${JSON.stringify(value)}\n`, true), stop: () => runtime.stop() });
    });
    const timeout = setTimeout(() => runtime.stop('Integration test timeout'), 25000);
    try { await runtime.start(lang, code); } finally { clearTimeout(timeout); }
    assert(runtime.safeToRelease, 'sandbox must confirm termination');
    return { events, output: events.filter((e) => e.type === 'output').map((e) => e.text).join(''),
        graphics: events.filter((e) => e.type === 'turtle').flatMap((e) => e.commands), exit: events.at(-1) };
}
function shortProtectionRuntime(overrides = {}) {
    const short = { ...protocol, IDE_LIMITS: { ...protocol.IDE_LIMITS, executionSeconds: 0.3, inputIdleSeconds: 0.3, ...overrides } };
    const shortWatchdog = load('ide_watchdog.ts', { './ide_protocol': short });
    return load('ide_runtime.ts', { './ide_protocol': short, './ide_watchdog': shortWatchdog }).IdeRuntime;
}
describe('dedicated go-judge IDE integration', { skip: !host }, () => {
    it('automatically stops an abandoned real input, a busy loop and an endless sleeping loop', async () => {
        const Runtime = shortProtectionRuntime();
        for (const source of ['input()', 'while True: pass', 'import time\nwhile True: time.sleep(1)']) {
            const result = await run('py.py3', source, () => {}, Runtime);
            assert.equal(result.exit.status, 'stopped');
            assert(result.exit.reason.includes(source === 'input()' ? '5 分钟' : '2 分钟'));
        }
    });
    it('keeps a waiting turtle usable beyond the compute budget, but stops a stuck event callback', async () => {
        const Runtime = shortProtectionRuntime(); let sent = false;
        const source = 'import turtle as t\nt.onkey(lambda:t.bye(),"space")\nt.listen()\nprint("ready")\nt.done()';
        const okay = await run('py.py3', source, (event, io) => {
            if (!sent && event.type === 'output' && event.text.includes('ready')) {
                sent = true; setTimeout(() => io.turtle({ type: 'key', key: ' ', action: 'up' }), 600);
            }
        }, Runtime);
        assert.equal(okay.exit.status, 'finished');
        let callbackSent = false;
        const stuck = await run('py.py3', 'import turtle as t\nimport time\nt.onkey(lambda:time.sleep(10),"space")\nt.listen()\nprint("ready")\nt.done()', (event, io) => {
            if (!callbackSent && event.type === 'output' && event.text.includes('ready')) {
                callbackSent = true; io.turtle({ type: 'key', key: ' ', action: 'up' });
            }
        }, Runtime);
        assert.equal(stuck.exit.status, 'stopped'); assert(stuck.exit.reason.includes('2 分钟'));
    });
    it('charges a turtle timer callback inside input(), while a nested input still pauses execution', async () => {
        const Runtime = shortProtectionRuntime({ inputIdleSeconds: 2 });
        const stuck = await run('py.py3', 'import turtle as t\nimport time\nt.ontimer(lambda:time.sleep(10),30)\ninput()', () => {}, Runtime);
        assert.equal(stuck.exit.status, 'stopped'); assert(stuck.exit.reason.includes('2 分钟'));
        let nested = false; let outer = false;
        const result = await run('py.py3', 'import turtle as t\ndef callback():\n print("INNER",flush=True)\n print("GOT",input(),flush=True)\nt.ontimer(callback,30)\nprint("OUTER",input())', (event, io) => {
            if (event.type !== 'output') return;
            if (!nested && event.text.includes('INNER')) { nested = true; setTimeout(() => io.input('inside\n'), 600); }
            if (!outer && event.text.includes('GOT')) { outer = true; setTimeout(() => io.input('outside\n'), 100); }
        }, Runtime);
        assert.equal(result.exit.status, 'finished'); assert(result.output.includes('GOT inside')); assert(result.output.includes('OUTER outside'));
    });
    it('runs four isolated students including a compiler, rejects a fifth, and immediately reuses a stopped slot', async () => {
        const { MongoMemoryServer } = require('mongodb-memory-server'); const { MongoClient } = require('mongodb');
        const mongo = await MongoMemoryServer.create(); const client = await MongoClient.connect(mongo.getUri());
        const database = client.db('ide-four-students');
        const { acquireIdeLease } = load('ide_quota.ts', { './ide_protocol': protocol,
            '../service/db': { collection: (name) => database.collection(name) } });
        const jobs = [];
        const wait = async (predicate) => {
            const end = Date.now() + 20000;
            while (!predicate()) { if (Date.now() > end) throw new Error('Four-user runtime did not become ready'); await new Promise((resolve) => setTimeout(resolve, 20)); }
        };
        const launch = async (uid, native = false) => {
            const lease = await acquireIdeLease(uid, 4, Date.now(), native);
            const events = [];
            const runtime = new IdeRuntime(randomUUID(), host, (event) => events.push(event), () => lease.releaseCompilation());
            const job = { runtime, events }; jobs.push(job);
            const source = native ? '#include<bits/stdc++.h>\nint main(){int n;std::cin>>n;long long a=0;for(int i=0;i<5000000;i++)a+=i%7;std::cout<<n<<":"<<a<<std::endl;}'
                : 'memory=bytearray(16*1024*1024)\nn=int(input())\ntotal=sum(i%7 for i in range(500000))\nprint(str(n)+":"+str(total))';
            job.done = runtime.start(native ? 'cc.cc17' : 'py.py3', source).finally(async () => {
                assert(runtime.safeToRelease); await lease.release();
            });
            return job;
        };
        try {
            await launch(1, true);
            await Promise.all([launch(2), launch(3), launch(4)]);
            await wait(() => jobs.every((job) => job.events.some((event) => event.type === 'input-request')));
            await assert.rejects(acquireIdeLease(5, 4), (error) => error.code === 'BUSY');
            jobs[1].runtime.stop(); await jobs[1].done;
            assert.equal(jobs[1].events.at(-1).status, 'stopped');
            const replacement = await launch(5);
            await wait(() => replacement.events.some((event) => event.type === 'input-request'));
            for (const [index, job] of jobs.entries()) if (index !== 1) job.runtime.input(0, `${index + 10}\n`);
            await Promise.all(jobs.map((job) => job.done));
            for (const [index, job] of jobs.entries()) if (index !== 1) {
                assert.equal(job.events.at(-1).status, 'finished');
                assert(job.events.filter((event) => event.type === 'output').map((event) => event.text).join('').startsWith(`${index + 10}:`));
            }
            assert.equal(await database.collection('ide.lease').countDocuments(), 0);
        } finally {
            jobs.forEach((job) => job.runtime.stop()); await Promise.allSettled(jobs.map((job) => job.done));
            await client.close(); await mongo.stop();
        }
    });
    it('streams unicode Python prompts and repeated actual input waits', async () => {
        let count = 0;
        const result = await run('py.py3', 'a=input("名字：")\nb=input("年龄：")\nprint(a,b)', (event, io) => {
            if (event.type === 'input-request') io.input(count++ === 0 ? '小明\n' : '10\n');
        });
        assert.equal(count, 2); assert(result.output.includes('小明 10')); assert.equal(result.exit.status, 'finished');
    });
    it('detects C++ cin without a prompt and streams the result', async () => {
        let asked = 0;
        const result = await run('cc.cc17', '#include<bits/stdc++.h>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<std::endl;}', (event, io) => {
            if (event.type === 'input-request' && !asked++) io.input('12 30\n');
        });
        assert(asked > 0); assert.equal(result.output.trim(), '42'); assert.equal(result.exit.status, 'finished');
    });
    it('does not invent terminal activity for an empty C++ program', async () => {
        const result = await run('cc.cc17', 'int main(){}');
        assert.equal(result.output, ''); assert(!result.events.some((e) => e.type === 'input-request')); assert.equal(result.exit.status, 'finished');
    });
    it('flushes printf before a long running native program ends', async () => {
        let saw = false;
        const result = await run('cc.cc17', '#include<cstdio>\n#include<unistd.h>\nint main(){printf("first");sleep(10);puts("last");}', (event, io) => {
            if (event.type === 'output' && event.text.includes('first')) { saw = true; io.stop(); }
        });
        assert(saw); assert(!result.output.includes('last')); assert.equal(result.exit.status, 'stopped');
    });
    it('keeps the same live turtle process for mouse and keyboard actions', async () => {
        let sent = false;
        const result = await run('py.py3', 'import turtle\ns=turtle.Screen()\nt=turtle.Turtle()\nt.speed(0)\nt.forward(40)\ns.onclick(lambda x,y: (print("clicked",int(x)),t.goto(x,y)))\ns.onkey(lambda: (print("key"),s.bye()),"space")\ns.listen()\nprint("ready")\ns.mainloop()', (event, io) => {
            if (!sent && event.type === 'output' && event.text.includes('ready')) {
                sent = true; io.turtle({ type: 'click', x: 80, y: 30, button: 1, action: 'click' });
                setTimeout(() => io.turtle({ type: 'key', key: ' ', action: 'up' }), 200);
            }
        });
        assert(result.output.includes('clicked 80')); assert(result.output.includes('key'));
        assert(result.graphics.some((c) => c.op === 'line')); assert.equal(result.exit.status, 'finished');
    });
    it('stops an infinite loop promptly and leaves the next run usable', async () => {
        const result = await run('py.py3', 'while True: pass', (event, io) => {
            if (event.type === 'state' && event.state === 'running') setTimeout(io.stop, 300);
        });
        assert.equal(result.exit.status, 'stopped'); const next = await run('py.py3', 'print("alive")'); assert.equal(next.output.trim(), 'alive');
    });
    it('isolates filesystem/network and reports syntax errors without affecting another student run', async () => {
        const [a, b] = await Promise.all([
            run('py.py3', 'import os,socket\nprint(os.path.exists("/root/.hydro"))\ns=socket.socket()\ns.settimeout(.2)\nprint(s.connect_ex(("127.0.0.1",5050))!=0)'),
            run('py.py3', 'if bad syntax'),
        ]);
        assert.equal(a.output.trim(), 'False\nTrue'); assert.equal(a.exit.status, 'finished'); assert(b.output.includes('SyntaxError')); assert.equal(b.exit.status, 'failed');
    });
});
