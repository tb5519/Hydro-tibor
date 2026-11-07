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
const protocol = load('ide_protocol.ts'); const { IdeRuntime } = load('ide_runtime.ts', { './ide_protocol': protocol });
async function run(lang, code, onEvent = () => {}) {
    const events = []; let seq = 0; let runtime;
    runtime = new IdeRuntime(randomUUID(), host, (event) => {
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
describe('dedicated go-judge IDE integration', { skip: !host }, () => {
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
