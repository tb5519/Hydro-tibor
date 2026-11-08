const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, after, beforeEach, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
    { module, exports: module.exports, Buffer, Date, URL, require: (name) => dependencies[name] ?? require(name) });
  return module.exports;
}
let mongo; let client; let files;
const protocol = load('packages/hydrooj/src/lib/ide_protocol.ts');
const payload = (name = '程序.py') => ({ name, code: 'print("你好")', lang: 'py.py3' });
before(async () => {
  mongo = await MongoMemoryServer.create(); client = await MongoClient.connect(mongo.getUri());
  const database = client.db('files');
  files = load('packages/hydrooj/src/model/ide_file.ts', { '../service/db': { collection: (name) => database.collection(name) }, '../lib/ide_protocol': protocol });
});
after(async () => { await client?.close(); await mongo?.stop(); });
beforeEach(async () => files.libraries.deleteMany({}));
it('keeps cloud files isolated per authenticated user and classroom and lists no source', async () => {
  const file = await files.saveIdeFile(2, 'python', payload(), ['py.py3']);
  assert.equal((await files.getIdeFile(2, 'python', file.id)).code, payload().code);
  assert.equal((await files.listIdeFiles(2, 'python'))[0].code, undefined);
  assert.equal((await files.listIdeFiles(3, 'python')).length, 0);
  assert.equal((await files.listIdeFiles(2, 'cpp')).length, 0);
  for (const [uid, domain] of [[3, 'python'], [2, 'cpp']]) {
    await assert.rejects(files.getIdeFile(uid, domain, file.id), (error) => error.code === 'NOT_FOUND');
    await assert.rejects(files.saveIdeFile(uid, domain, { ...payload(), id: file.id, revision: 1 }, ['py.py3']), (error) => error.code === 'CONFLICT');
    await assert.rejects(files.deleteIdeFile(uid, domain, file.id, 1), (error) => error.code === 'CONFLICT');
  }
});
it('prevents simultaneous updates from silently overwriting a newer saved program', async () => {
  const file = await files.saveIdeFile(2, 'python', payload(), ['py.py3']);
  const attempts = await Promise.allSettled(['a', 'b', 'c'].map((code) => files.saveIdeFile(2, 'python', { ...payload(), id: file.id, revision: 1, code }, ['py.py3'])));
  assert.equal(attempts.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert(attempts.filter((entry) => entry.status === 'rejected').every((entry) => entry.reason.code === 'CONFLICT'));
  const latest = await files.getIdeFile(2, 'python', file.id); assert.equal(latest.revision, 2);
  await assert.rejects(files.deleteIdeFile(2, 'python', file.id, 1), (error) => error.code === 'CONFLICT');
  await files.deleteIdeFile(2, 'python', file.id, 2); assert.equal((await files.listIdeFiles(2, 'python')).length, 0);
});
it('enforces its cloud capacity atomically even when many requests arrive at once', async () => {
  const outcomes = await Promise.allSettled(Array.from({ length: 65 }, (_, i) => files.saveIdeFile(2, 'python', payload(`${i}.py`), ['py.py3'])));
  assert.equal(outcomes.filter((entry) => entry.status === 'fulfilled').length, 50);
  assert.equal((await files.listIdeFiles(2, 'python')).length, 50);
  assert(outcomes.filter((entry) => entry.status === 'rejected').every((entry) => entry.reason.code === 'FILE_LIMIT'));
});
it('rejects traversal names, unsupported languages, binary data and oversized unicode text', async () => {
  for (const invalid of [{ name: '../x.py' }, { lang: 'bash' }, { code: '\0' }, { code: '中'.repeat(44000) }, { id: { $ne: null } }, { name: 'x\ny.py' }]) {
    await assert.rejects(files.saveIdeFile(2, 'python', { ...payload(), ...invalid }, ['py.py3']), (error) => error.code === 'INVALID_MESSAGE');
  }
});
it('checks fresh access and same-origin rules for every list/read/write without trusting request identity', async () => {
  const events = [];
  class Handler {}
  const module = load('packages/hydrooj/src/handler/ide_files.ts', {
    '../service/server': { Handler }, '../lib/ide_protocol': protocol,
    '../model/builtin': { PERM: { PERM_SUBMIT_PROBLEM: 8 }, PRIV: { PRIV_USER_PROFILE: 4 } },
    '../model/ide_file': files,
    './ide_runtime': { authorizeIdeAccess: async () => { events.push('authorize'); return { languages: ['py.py3'] }; }, checkIdeHttpOrigin: (_, mutation) => events.push(`origin:${mutation}`) },
  });
  const handler = new module.IdeFilesHandler();
  Object.assign(handler, { user: { _id: 2 }, domain: { _id: 'python' }, args: { action: 'save', uid: 99, domainId: 'other', ...payload() },
    response: { addHeader() {} }, checkPriv() {}, checkPerm() {}, limitRate: async () => {} });
  await handler.post(); assert(handler.response.body.file.id);
  assert.deepEqual(events, ['origin:true', 'authorize']);
  assert.equal((await files.listIdeFiles(2, 'python')).length, 1);
  assert.equal((await files.listIdeFiles(99, 'other')).length, 0);
});
