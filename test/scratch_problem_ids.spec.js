const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const source = path.join(__dirname, '../packages/hydrooj/src/model/scratch_problem_id.ts');
class ValidationError extends Error { constructor(field, _unused, message) { super(message || field); this.field = field; } }
class PermissionError extends Error {}
class NotFoundError extends Error {}
let server; let client; let database; let model; let projectSequence = 0;
const teacher = { domainId: 'scratch-a', uid: 10, isTeacher: true };
const student = { ...teacher, uid: 20, isTeacher: false };
const foreign = { ...teacher, domainId: 'scratch-b' };
function load() {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(source, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, Date, console,
        require: name => name === '../service/db' ? { collection: name => database.collection(name) }
            : name === '../error' ? { ValidationError, PermissionError, NotFoundError } : require(name),
    });
    return module.exports;
}
async function project(extra = {}) {
    const doc = { _id: new ObjectId(), domainId: teacher.domainId, kind: 'problem', hidden: false, createdAt: new Date(Date.UTC(2025, 0, 1) + projectSequence++), ...extra };
    await database.collection('scratch.assignment').insertOne(doc); return doc;
}
async function paper(docId, extra = {}) {
    const doc = { _id: new ObjectId(), domainId: teacher.domainId, docType: 10, docId, hidden: false,
        objectivePaper: { items: [{ source: 1, score: 10 }] }, ...extra };
    await database.collection('document').insertOne(doc); return doc;
}
const mapping = async () => Object.fromEntries(await model.ensureDomainProblemCodes(teacher.domainId));
const committed = async sourceId => (await model.codes.findOne({ domainId: teacher.domainId, sourceId: String(sourceId) })).code;

before(async () => {
    server = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
    client = await MongoClient.connect(server.getUri()); database = client.db('scratch_problem_id_tests');
});
beforeEach(async () => {
    projectSequence = 0;
    await Promise.all(['scratch.assignment', 'document', 'scratch.problem.code', 'scratch.problem.counter']
        .map(name => database.collection(name).deleteMany({})));
    model = load();
});
after(async () => { await client?.close(); await server?.stop(); });

describe('Scratch display IDs with real MongoDB', () => {
    it('normalizes and validates teacher supplied display IDs', () => {
        for (const [input, output] of [[' s12 ', 'S12'], ['42', '42'], [42, '42'], ['a-b_2', 'A-B_2'], ['', undefined], ['  ', undefined]]) {
            assert.equal(model.normalizeProblemCode(input), output);
        }
        for (const value of ['0', '01', '-1', '1.2', 'bad code', '中文', 'A'.repeat(33), {}, 1.5]) {
            assert.throws(() => model.normalizeProblemCode(value), ValidationError);
        }
        assert.equal(model.problemCodeKey('objective', 42), 'objective:42');
        assert.throws(() => model.problemCodeKey('objective', '0'), ValidationError);
    });
    it('sorts display IDs in natural order with deterministic ties', () => {
        const entries = ['S10', 'S2', 'S1', '12', '2'].map(problemCode => ({ problemCode }));
        entries.sort(model.compareProblemCodes);
        assert.deepEqual(entries.map(entry => entry.problemCode), ['2', '12', 'S1', 'S2', 'S10']);
    });
    it('backfills both source kinds once in stable creation order and leaves identities untouched', async () => {
        const a = await project({ _id: new ObjectId('000000010000000000000001'), createdAt: new Date(1000) });
        const b = await paper(100, { _id: new ObjectId('000000020000000000000001'), hidden: true });
        const c = await project({ _id: new ObjectId('000000030000000000000001'), createdAt: new Date(3000) });
        await project({ kind: 'assignment' }); await project({ problemPaperId: 100 });
        await paper(101, { objectiveKind: 'single' }); await paper(102, { reference: { domainId: 'other', pid: 3 } });
        const ids = await mapping();
        assert.deepEqual(ids, { [`project:${a._id}`]: 'S1', 'objective:100': 'S2', [`project:${c._id}`]: 'S3' });
        assert.deepEqual(await mapping(), ids);
        assert.equal(await database.collection('scratch.assignment').countDocuments({ _id: a._id }), 1);
        assert.equal((await database.collection('document').findOne({ _id: b._id })).docId, 100);
    });
    it('concurrent independent processes assign exactly one stable code per source', async () => {
        const docs = await Promise.all(Array.from({ length: 8 }, () => project()));
        await paper(1); await paper(2);
        const other = load();
        const results = await Promise.all([model.ensureDomainProblemCodes(teacher.domainId), other.ensureDomainProblemCodes(teacher.domainId)]);
        assert.deepEqual(Object.fromEntries(results[0]), Object.fromEntries(results[1]));
        assert.equal(await model.codes.countDocuments({ domainId: teacher.domainId }), 10);
        assert.equal(new Set(Object.values(Object.fromEntries(results[0]))).size, 10);
        assert(docs.every(doc => results[0].has(`project:${doc._id}`)));
    });
    it('restricts authoring and reads to the source domain and learner visibility', async () => {
        const a = await project(); const hidden = await project({ hidden: true }); await mapping();
        await assert.rejects(model.setProblemCode(student, 'project', a._id, 'X1'), PermissionError);
        await assert.rejects(model.setProblemCode(foreign, 'project', a._id, 'X1'), NotFoundError);
        await assert.rejects(model.getProblemCode(student, 'project', hidden._id), NotFoundError);
        assert.equal(await model.getProblemCode(student, 'project', a._id), 'S1');
    });
    it('shares case-insensitive uniqueness across creative and objective problems', async () => {
        const a = await project(); await paper(5); await mapping();
        await model.setProblemCode(teacher, 'project', a._id, ' test-1 ');
        await assert.rejects(model.setProblemCode(teacher, 'objective', 5, 'test-1'), ValidationError);
        assert.equal(await committed(a._id), 'TEST-1');
        const b = await project({ domainId: foreign.domainId });
        assert.equal(await model.setProblemCode(foreign, 'project', b._id, 'TEST-1'), 'TEST-1');
    });
    it('uses the committed ID when the edit field is blank', async () => {
        const a = await project(); await mapping(); await model.setProblemCode(teacher, 'project', a._id, 'A9');
        assert.equal(await model.setProblemCode(teacher, 'project', a._id, ' '), 'A9');
        assert.equal(await committed(a._id), 'A9');
    });
    it('allows only one simultaneous reservation of a target code across sources', async () => {
        const a = await project(); const b = await project(); await mapping();
        const settled = await Promise.allSettled([model.setProblemCode(teacher, 'project', a._id, 'NEW'),
            model.setProblemCode(teacher, 'project', b._id, 'NEW')]);
        assert.equal(settled.filter(result => result.status === 'fulfilled').length, 1);
        assert.equal(await model.codes.countDocuments({ code: 'NEW' }), 1);
        assert.equal(await model.codes.countDocuments({ code: { $in: ['S1', 'S2'] } }), 1);
    });
    it('keeps the old visible ID and locks same-source edits until metadata is committed', async () => {
        const a = await project(); await mapping();
        const pending = await model.reserveProblemCode(teacher, 'project', a._id, 'NEXT');
        assert.equal(await committed(a._id), 'S1');
        await assert.rejects(model.reserveProblemCode(teacher, 'project', a._id, 'OTHER'), ValidationError);
        await pending.commit(); await pending.rollback();
        assert.equal(await committed(a._id), 'NEXT');
    });
    it('reserves both old and new codes while a save is pending and releases only the new code on failure', async () => {
        const a = await project(); const b = await project(); await mapping();
        const pending = await model.reserveProblemCode(teacher, 'project', a._id, 'NEXT');
        await assert.rejects(model.setProblemCode(teacher, 'project', b._id, 'S1'), ValidationError);
        await assert.rejects(model.setProblemCode(teacher, 'project', b._id, 'NEXT'), ValidationError);
        await pending.rollback();
        assert.equal(await committed(a._id), 'S1');
        assert.equal(await model.setProblemCode(teacher, 'project', b._id, 'NEXT'), 'NEXT');
    });
    it('grants only one automatic creation lease for a new immutable source ID', async () => {
        const sourceId = new ObjectId();
        const results = await Promise.allSettled([model.reserveProblemCode(teacher, 'project', sourceId, ''),
            model.reserveProblemCode(teacher, 'project', sourceId, '')]);
        assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
        const winner = results.find(result => result.status === 'fulfilled').value;
        await winner.rollback(); assert.equal(await model.codes.countDocuments({}), 0);
    });
    it('does not let another source steal the code of a pending source creation', async () => {
        const a = await project(); await mapping(); const id = new ObjectId();
        const pending = await model.reserveProblemCode(teacher, 'project', id, 'FUTURE');
        await assert.rejects(model.setProblemCode(teacher, 'project', a._id, 'FUTURE'), ValidationError);
        await pending.rollback();
        assert.equal(await model.setProblemCode(teacher, 'project', a._id, 'FUTURE'), 'FUTURE');
    });
    it('reuses codes of deleted sources but protects existing hidden challenges', async () => {
        const a = await project(); const b = await project({ hidden: true }); const c = await project(); await mapping();
        await database.collection('scratch.assignment').deleteOne({ _id: a._id });
        assert.equal(await model.setProblemCode(teacher, 'project', c._id, 'S1'), 'S1');
        await assert.rejects(model.setProblemCode(teacher, 'project', c._id, 'S2'), ValidationError);
        assert.equal(await committed(b._id), 'S2');
    });
    it('recovers an expired pending code while fencing a late commit and rollback', async () => {
        const a = await project(); const b = await project(); await mapping();
        const pending = await model.reserveProblemCode(teacher, 'project', a._id, 'RECOVER');
        await model.codes.updateOne({ sourceId: String(a._id) }, { $set: { reservedUntil: new Date(0) } });
        assert.equal(await model.setProblemCode(teacher, 'project', b._id, 'RECOVER'), 'RECOVER');
        await assert.rejects(pending.commit(), ValidationError); await pending.rollback();
        assert.equal(await committed(a._id), 'S1'); assert.equal(await committed(b._id), 'RECOVER');
    });
    it('never reclaims the canonical ID just because its pending save expired', async () => {
        const a = await project(); const b = await project(); await mapping();
        const pending = await model.reserveProblemCode(teacher, 'project', a._id, 'TEMP');
        await model.codes.updateOne({ sourceId: String(a._id) }, { $set: { reservedUntil: new Date(0) } });
        await assert.rejects(model.setProblemCode(teacher, 'project', b._id, 'S1'), ValidationError);
        await pending.rollback(); assert.equal(await committed(a._id), 'S1');
    });
    it('fences old reservation cleanup after a later reservation commits', async () => {
        const a = await project(); await mapping();
        const old = await model.reserveProblemCode(teacher, 'project', a._id, 'FIRST');
        await model.codes.updateOne({ sourceId: String(a._id) }, { $set: { reservedUntil: new Date(0) } });
        const next = await model.reserveProblemCode(teacher, 'project', a._id, 'SECOND');
        await next.commit(); await assert.rejects(old.commit(), ValidationError); await old.rollback();
        assert.equal(await committed(a._id), 'SECOND');
    });
    it('a very large custom S number cannot exhaust the automatic counter', async () => {
        const a = await project(); await mapping();
        await model.setProblemCode(teacher, 'project', a._id, 'S9007199254740991');
        const b = await project(); await mapping();
        assert.equal(await committed(b._id), 'S2');
    });
    it('backfills legacy registry claims before allowing renames', async () => {
        const a = await project();
        await model.codes.insertOne({ _id: `${encodeURIComponent(teacher.domainId)}:project:${a._id}`, domainId: teacher.domainId,
            kind: 'project', sourceId: String(a._id), code: 'LEGACY9', revision: 'old-revision', updatedAt: new Date() });
        assert.equal(await model.getProblemCode(teacher, 'project', a._id), 'LEGACY9');
        const current = await model.codes.findOne({ sourceId: String(a._id) });
        assert.deepEqual(current.claimedCodes, ['LEGACY9']);
    });
});
