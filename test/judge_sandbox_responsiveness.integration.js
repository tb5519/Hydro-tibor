// Explicit local Docker smoke test: real Python/C++ infinite loops and a normal submission.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

assert.equal(process.env.HYDRO_JUDGE_SANDBOX_SMOKE, '1', 'Enable this local-only test with HYDRO_JUDGE_SANDBOX_SMOKE=1');
const container = process.env.HYDRO_JUDGE_TEST_CONTAINER || 'hydro-dev-judge-1';
const program = String.raw`
const assert = require('node:assert/strict');
const http = require('node:http');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const pkg = require.resolve('@hydrooj/hydrojudge/package.json', {
  paths: ['/usr/local/share/.config/yarn/global/node_modules', '/usr/local/lib/node_modules'],
});
const judgeRequire = createRequire(pkg);
function call(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: 5050, path: '/' + endpoint, method,
      headers: { 'Content-Type': 'application/json' } }, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (part) => { data += part; });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error('Sandbox HTTP ' + response.statusCode));
        try { resolve(data ? JSON.parse(data) : null); } catch (error) { reject(error); }
      });
    });
    request.setTimeout(10000, () => request.destroy(new Error('Local sandbox smoke test timed out')));
    request.on('error', reject);
    request.end(body ? JSON.stringify(body) : undefined);
  });
}
function command(args, time, copyIn = {}, memory = 256) {
  return { args, env: ['PATH=/usr/bin:/bin', 'HOME=/w', 'LANG=C.UTF-8'],
    files: [{ content: '' }, { name: 'stdout', max: 65536 }, { name: 'stderr', max: 65536 }],
    cpuLimit: time * 1000000, clockLimit: time * 3000000, memoryLimit: memory * 1024 * 1024,
    procLimit: 32, copyIn };
}
async function main() {
  const { default: Queue } = await import(pathToFileURL(judgeRequire.resolve('p-queue')).href);
  const source = '#include <iostream>\nint main(int n,char**v){if(n>1){volatile unsigned long long x=0;for(;;)x++;}std::cout<<"OK"<<std::endl;}';
  const build = command(['/usr/bin/g++', 'main.cpp', '-O2', '-o', 'main'], 10000, { 'main.cpp': { content: source } }, 512);
  build.copyOutCached = ['main'];
  const [compiled] = await call('POST', 'run', { cmd: [build] });
  assert.equal(compiled.status, 'Accepted', JSON.stringify(compiled));
  const binary = compiled.fileIds.main;
  try {
    for (const language of ['Python', 'C++']) {
      // Mirrors the prepared settings: two submissions, two executions, one case per submission.
      const submissions = new Queue({ concurrency: 2 });
      const execution = new Queue({ concurrency: 2 });
      const events = [];
      let started;
      const firstCase = new Promise((resolve) => { started = resolve; });
      const run = (loop) => execution.add(async () => {
        const args = language === 'Python' ? ['/usr/bin/python3', '-c', loop ? 'while True: pass' : 'print("OK")']
          : ['./main', ...(loop ? ['loop'] : [])];
        if (loop) started();
        const [result] = await call('POST', 'run', { cmd: [command(args, loop ? 100 : 1000,
          language === 'C++' ? { main: { fileId: binary } } : {})] });
        return result;
      });
      const slow = submissions.add(async () => {
        for (let i = 0; i < 8; i++) {
          const result = await run(true);
          assert.equal(result.status, 'Time Limit Exceeded', JSON.stringify(result));
          events.push('TLE');
        }
        events.push('slow-finished');
      });
      await firstCase;
      const normal = submissions.add(async () => {
        const result = await run(false);
        assert.equal(result.status, 'Accepted', JSON.stringify(result));
        assert.equal(result.files.stdout.trim(), 'OK');
        events.push('normal-finished');
      });
      await Promise.all([slow, normal]);
      assert(events.indexOf('normal-finished') < events.indexOf('slow-finished'), events.join(', '));
      console.log(JSON.stringify({ language, infiniteCasesTimedOut: 8, normalFinishedBeforeInfiniteSubmission: true }));
    }
  } finally {
    await call('DELETE', 'file/' + encodeURIComponent(binary));
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;
process.stdout.write(execFileSync('docker', ['exec', '-i', container, 'node'], {
    input: program, timeout: 45000, maxBuffer: 1024 * 1024,
}));
