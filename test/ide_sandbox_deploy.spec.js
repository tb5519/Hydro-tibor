const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { it } = require('node:test');
const root = path.resolve(__dirname, '..');

// Exercise the actual provisioning script with a stateful Docker stub. No real
// containers, networks, restarts, image pulls or builds are invoked by this test.
function fixture(initial) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-deploy-test-'));
    const statePath = path.join(directory, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify({ exists: true, memory: 536870912, cpu: 600000000, mounts: 1, updates: 0, calls: [], ...initial }));
    fs.writeFileSync(path.join(directory, 'docker'), `#!${process.execPath}
const fs=require('fs'); const args=process.argv.slice(2); const file=process.env.IDE_TEST_STATE;
const s=JSON.parse(fs.readFileSync(file)); s.calls.push(args); let output='', status=0;
const image='sha256:'+ 'a'.repeat(64);
if(args[0]==='inspect') {
 if(args.length===1 || (args.length===2 && !s.exists)) status=1;
 else if(args[1]==='-f') {
  const format=args[2], target=args.at(-1);
  if(format==='{{.Image}}') output=image;
  else if(format.includes('onebyone.service')) output='ide';
  else if(format.includes('Config.Entrypoint')) output='["/usr/bin/sandbox"]';
  else if(format.includes('Config.Cmd')) output='["-http-addr","0.0.0.0:5050","-mount-conf","/config/mount.yaml","-parallelism","2","-file-timeout","5m"]';
  else if(format.includes('CgroupnsMode')) output='private';
  else if(format.includes('HostConfig.Memory')) output=s.memory+'|'+s.memory+'|'+s.cpu+'|128';
  else if(format.includes('PortBindings')) output='0|'+s.mounts+'|1';
  else if(format.includes('.Source')) output=process.env.IDE_TEST_ROOT+'/docker/ide/mount.yaml|/config/mount.yaml|false';
  else if(format.includes('json .NetworkSettings')) output='{"hydro-ide-internal":{}}';
  else if(format.includes('NetworkSettings.Networks')) output='hydro-ide-internal';
  else status=9;
 }
} else if(args[0]==='network') { if(args.includes('-f')) output='true'; }
else if(args[0]==='image' && args[1]==='inspect') {}
else if(args[0]==='update') { if(s.updateFail) status=1; else {s.memory=805306368;s.updates++;} }
else if(args[0]==='run') {s.exists=true; s.memory=805306368; output='created';}
else if(args[0]==='start'||args[0]==='exec') {}
else status=9;
fs.writeFileSync(file,JSON.stringify(s)); if(output)process.stdout.write(output+'\\n'); process.exit(status);
`, { mode: 0o755 });
    return {
        run() { return spawnSync('/bin/bash', ['docker/ensure-ide-sandbox.sh'], { cwd: root, encoding: 'utf8',
            env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, IDE_TEST_STATE: statePath, IDE_TEST_ROOT: root } }); },
        state() { return JSON.parse(fs.readFileSync(statePath)); },
        close() { fs.rmSync(directory, { recursive: true, force: true }); },
    };
}
it('upgrades the known 512 MiB profile in place once, then reuses the 768 MiB service', () => {
    const f = fixture({});
    try {
        const first = f.run(); assert.equal(first.status, 0, first.stderr); assert.equal(f.state().updates, 1);
        const second = f.run(); assert.equal(second.status, 0, second.stderr); assert.equal(f.state().updates, 1);
        assert(first.stdout.includes('768 MB')); assert(second.stdout.includes('4 位'));
        assert(!f.state().calls.some((args) => ['run', 'rm', 'restart', 'build', 'pull'].includes(args[0])));
    } finally { f.close(); }
});
it('rejects unexpected CPU limits or mounts before updating or starting the service', () => {
    for (const initial of [{ cpu: 1000000000 }, { mounts: 2 }]) {
        const f = fixture(initial);
        try {
            const result = f.run(); assert.notEqual(result.status, 0);
            assert(!f.state().calls.some((args) => ['update', 'start', 'run', 'restart'].includes(args[0])));
        } finally { f.close(); }
    }
});
it('stops immediately when the memory update fails', () => {
    const f = fixture({ updateFail: true });
    try {
        assert.notEqual(f.run().status, 0);
        assert(!f.state().calls.some((args) => ['start', 'exec', 'run', 'restart'].includes(args[0])));
    } finally { f.close(); }
});
it('creates new services with the prepared image and 768 MiB, retaining the CPU cap and private mount', () => {
    const f = fixture({ exists: false });
    try {
        const result = f.run(); assert.equal(result.status, 0, result.stderr);
        const call = f.state().calls.find((args) => args[0] === 'run'); assert(call);
        for (const [flag, value] of [['--memory', '768m'], ['--memory-swap', '768m'], ['--cpus', '0.6'], ['--cgroupns', 'private']]) {
            assert.equal(call[call.indexOf(flag) + 1], value);
        }
        assert(!f.state().calls.some((args) => ['build', 'pull', 'restart'].includes(args[0])));
    } finally { f.close(); }
});
