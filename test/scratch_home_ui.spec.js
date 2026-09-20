const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '..');
function load(relative, dependencies) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, relative), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, {
        module, exports: module.exports, Date,
        require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
    });
    return module.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const student = { domainId: 'scratch-a', uid: 20, isTeacher: false };
const teacher = { domainId: 'scratch-a', uid: 10, isTeacher: true };
const time = (offset) => new Date(Date.UTC(2026, 8, 20, 0, offset));
const record = (extra = {}) => ({ _id: new ObjectId(), domainId: student.domainId, owner: student.uid,
    createdAt: time(0), updatedAt: time(0), ...extra });
let mongod;
let client;
let model;
let handlers;

async function home(actor = student) {
    const handler = Object.create(handlers.ScratchMainHandler.prototype);
    handler.actor = actor;
    handler.renderScratch = async (template, body) => {
        assert.equal(template, 'scratch_main.html');
        handler.body = body;
    };
    await handler.get();
    return handler.body;
}

before(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    const database = client.db('scratch_home_ui_test');
    model = load('packages/hydrooj/src/model/scratch.ts', {
        '../context': {}, '../error': {}, '../lib/scratch_files': {}, '../logger': { Logger: class {} },
        '../service/db': {
            collection: (name) => database.collection(name),
            ensureIndexes: (collection, ...indexes) => collection.createIndexes(indexes),
        },
        './storage': {},
    });
    await model.apply({ on() {} });
    handlers = load('packages/hydrooj/src/handler/scratch.ts', {
        '../context': {}, '../error': {}, '../lib/domain_type': {}, '../lib/scratch_files': {},
        '../model/builtin': {}, '../model/domain': {}, '../model/scratch': model,
        '../model/storage': {}, '../model/user': {}, '../service/server': { Handler: class {} },
    });
});
beforeEach(async () => {
    await Promise.all([model.assignments, model.works, model.submissions].map((collection) => collection.deleteMany({})));
});
after(async () => {
    await client?.close();
    await mongod?.stop();
});

describe('Scratch junior homepage data', () => {
    it('shows an empty classroom without inventing a continuation or task state', async () => {
        const result = await home();
        assert.equal(result.continuationWork, null);
        assert.deepEqual(plain(result.assignmentStates), {});
        assert.deepEqual(plain(result.assignments), []);
        assert.deepEqual(plain(result.works), []);
        assert.deepEqual(plain(result.submissions), []);
    });

    it('continues the latest saved work belonging to this student and this domain', async () => {
        const older = record({ title: 'old saved', currentFileId: new ObjectId(), updatedAt: time(1) });
        const saved = record({ title: 'my saved work', currentFileId: new ObjectId(), updatedAt: time(2) });
        await model.works.insertMany([
            older, saved,
            record({ title: 'new empty work', currentFileId: null, updatedAt: time(3) }),
            record({ title: 'legacy unsaved work', updatedAt: time(4) }),
            record({ title: 'classmate work', owner: 21, currentFileId: new ObjectId(), updatedAt: time(5) }),
            record({ title: 'another domain', domainId: 'scratch-b', currentFileId: new ObjectId(), updatedAt: time(6) }),
        ]);
        const result = await home();
        assert.equal(result.continuationWork._id.toHexString(), saved._id.toHexString());
        assert(result.works.every((work) => work.owner === student.uid && work.domainId === student.domainId));
    });

    it('lets a teacher continue their own saved work even when recent class works all belong to students', async () => {
        const saved = record({ owner: teacher.uid, title: 'teacher demo', currentFileId: new ObjectId() });
        await model.works.insertMany([
            saved,
            ...Array.from({ length: 7 }, (_, index) => record({
                title: `student project ${index}`, currentFileId: new ObjectId(), updatedAt: time(index + 1),
            })),
        ]);
        const result = await home(teacher);
        assert.equal(result.works.length, 6);
        assert(result.works.every((work) => work.owner === student.uid));
        assert.equal(result.continuationWork._id.toHexString(), saved._id.toHexString());
        await model.works.deleteOne({ _id: saved._id });
        assert.equal((await home(teacher)).continuationWork, null);
    });

    it('distinguishes not started, unsaved, saved, submitted, and reviewed work without borrowing another student state', async () => {
        const assignments = Array.from({ length: 5 }, (_, index) => record({ owner: teacher.uid, title: `lesson ${index}` }));
        await model.assignments.insertMany(assignments);
        const works = assignments.slice(1).map((assignment, index) => record({
            assignmentId: assignment._id, currentFileId: index ? new ObjectId() : null,
        }));
        await model.works.insertMany([
            ...works,
            record({ assignmentId: assignments[0]._id, owner: 21, currentFileId: new ObjectId() }),
            record({ assignmentId: assignments[0]._id, domainId: 'scratch-b', currentFileId: new ObjectId() }),
        ]);
        const submitted = record({ assignmentId: assignments[3]._id, workId: works[2]._id, revision: 1, reviewedAt: null });
        const reviewed = record({ assignmentId: assignments[4]._id, workId: works[3]._id, revision: 1, reviewedAt: time(1) });
        await model.submissions.insertMany([
            submitted, reviewed,
            record({ assignmentId: assignments[0]._id, workId: new ObjectId(), revision: 1, owner: 21, reviewedAt: time(1) }),
            record({ assignmentId: assignments[0]._id, workId: new ObjectId(), revision: 1, domainId: 'scratch-b', reviewedAt: time(1) }),
        ]);
        const beforeRead = await Promise.all([model.assignments, model.works, model.submissions].map((collection) => collection.find().toArray()));
        const result = await home();
        const states = assignments.map((assignment) => plain(result.assignmentStates[assignment._id.toHexString()]));
        assert.deepEqual(states[0], { workId: null, hasSavedWork: false, submitted: false, reviewed: false, submissionId: null });
        assert.deepEqual(states[1], { workId: `${works[0]._id}`, hasSavedWork: false, submitted: false, reviewed: false, submissionId: null });
        assert.deepEqual(states[2], { workId: `${works[1]._id}`, hasSavedWork: true, submitted: false, reviewed: false, submissionId: null });
        assert.deepEqual(states[3], { workId: `${works[2]._id}`, hasSavedWork: true, submitted: true, reviewed: false, submissionId: `${submitted._id}` });
        assert.deepEqual(states[4], { workId: `${works[3]._id}`, hasSavedWork: true, submitted: true, reviewed: true, submissionId: `${reviewed._id}` });
        const afterRead = await Promise.all([model.assignments, model.works, model.submissions].map((collection) => collection.find().toArray()));
        assert.deepEqual(plain(afterRead), plain(beforeRead), 'loading the homepage must never mutate classroom data');
        const teacherStates = (await home(teacher)).assignmentStates;
        assert(Object.values(teacherStates).every((state) => !state.workId && !state.submitted));
    });

    it('keeps older submitted tasks complete beyond the recent-six feed and uses the latest submission review state', async () => {
        const olderAssignment = record({ owner: teacher.uid, title: 'older lesson' });
        const activeAssignment = record({ owner: teacher.uid, title: 'active lesson', createdAt: time(1) });
        await model.assignments.insertMany([olderAssignment, activeAssignment]);
        const oldWork = record({ assignmentId: olderAssignment._id, currentFileId: new ObjectId() });
        const activeWork = record({ assignmentId: activeAssignment._id, currentFileId: new ObjectId() });
        await model.works.insertMany([oldWork, activeWork]);
        const olderSubmission = record({ assignmentId: olderAssignment._id, workId: oldWork._id, revision: 1, reviewedAt: time(1) });
        const newSubmissions = Array.from({ length: 8 }, (_, index) => record({
            assignmentId: activeAssignment._id, workId: activeWork._id, revision: index + 1,
            createdAt: time(index + 2), reviewedAt: index < 7 ? time(20) : null,
            updatedAt: index < 7 ? time(20) : time(9),
        }));
        await model.submissions.insertMany([olderSubmission, ...newSubmissions]);
        const result = await home();
        assert.equal(result.submissions.length, 6);
        assert(result.submissions.every((submission) => submission.assignmentId.equals(activeAssignment._id)));
        const oldState = result.assignmentStates[`${olderAssignment._id}`];
        assert.equal(oldState.submitted, true);
        assert.equal(oldState.reviewed, true);
        assert.equal(`${oldState.submissionId}`, `${olderSubmission._id}`);
        const newState = result.assignmentStates[`${activeAssignment._id}`];
        assert.equal(newState.submitted, true);
        assert.equal(newState.reviewed, false);
        assert.equal(`${newState.submissionId}`, `${newSubmissions.at(-1)._id}`);
    });

    it('only returns task states for the six displayed assignments from the current domain', async () => {
        const assignments = Array.from({ length: 8 }, (_, index) => record({
            owner: teacher.uid, title: `lesson ${index}`, createdAt: time(index),
        }));
        const foreignAssignment = record({ domainId: 'scratch-b', owner: teacher.uid, createdAt: time(30) });
        await model.assignments.insertMany([...assignments, foreignAssignment]);
        const result = await home();
        assert.equal(result.assignments.length, 6);
        assert.deepEqual(Object.keys(result.assignmentStates).sort(), assignments.slice(2).map((assignment) => `${assignment._id}`).sort());
        assert(result.assignments.every((assignment) => assignment.domainId === student.domainId));
    });
});
