const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { after, before, beforeEach, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

class TrainingAlreadyEnrollError extends Error {}
class TrainingNotFoundError extends Error {}
let server; let client; let collection; let statuses; let training;
let interceptCounter;
const tid = new ObjectId();
const TYPE_TRAINING = 40;
const scope = (domainId = 'class-a', docId = tid) => ({ domainId, docId, docType: TYPE_TRAINING });
const progress = { donePids: [1, 2], doneNids: [1], done: true };

before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    const db = client.db('training-removal');
    collection = db.collection('document');
    statuses = db.collection('document.status');
    await statuses.createIndex({ domainId: 1, docType: 1, docId: 1, uid: 1 }, { unique: true });
    const document = {
        TYPE_TRAINING,
        coll: {
            findOneAndUpdate: async (...args) => {
                if (interceptCounter) await interceptCounter(args);
                return collection.findOneAndUpdate(...args);
            },
        },
        collStatus: statuses,
        get: (domainId, docType, docId) => collection.findOne({ domainId, docType, docId }),
        getStatus: (domainId, docType, docId, uid) => statuses.findOne({ domainId, docType, docId, uid }),
        setIfNotStatus: async (domainId, docType, docId, uid, key, value, ifNot, args) => {
            try {
                return await statuses.findOneAndUpdate(
                    { domainId, docType, docId, uid, [key]: { $ne: ifNot } },
                    { $set: { [key]: value, ...args } }, { upsert: true, returnDocument: 'after' },
                );
            } catch (error) {
                if (error.code === 11000) return false;
                throw error;
            }
        },
    };
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/model/training.ts'), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, {
        module, exports: module.exports,
        global: { Hydro: { model: {} } },
        require: (name) => name === './document' ? document : name === '../error'
            ? { TrainingAlreadyEnrollError, TrainingNotFoundError } : require(name),
    });
    training = module.exports;
});
beforeEach(async () => {
    interceptCounter = null;
    await Promise.all([collection.deleteMany({}), statuses.deleteMany({})]);
    await collection.insertOne({ ...scope(), attend: 0, dag: [], owner: 2 });
});
after(async () => { await client?.close(); await server?.stop(); });
const doc = () => collection.findOne(scope());
async function addExisting(uid = 24, count = 1) {
    await statuses.insertOne({ ...scope(), uid, enroll: 1, ...progress });
    await collection.updateOne(scope(), { $set: { attend: count } });
}

describe('training enrollment removal', () => {
    it('soft-removes only membership and restores existing progress on re-enrollment', async () => {
        await addExisting();
        assert.equal(await training.unenroll('class-a', tid, 24), true);
        const removed = await training.getStatus('class-a', tid, 24);
        assert.equal(removed.enroll, 0);
        for (const key of Object.keys(progress)) assert.deepEqual(removed[key], progress[key]);
        assert.equal((await doc()).attend, 0);
        await training.enroll('class-a', tid, 24);
        const rejoined = await training.getStatus('class-a', tid, 24);
        assert.equal(rejoined.enroll, 1);
        for (const key of Object.keys(progress)) assert.deepEqual(rejoined[key], progress[key]);
        assert.equal((await doc()).attend, 1);
    });

    it('makes repeated and simultaneous removals idempotent without negative counts', async () => {
        await addExisting();
        const removed = await Promise.all(Array.from({ length: 20 }, () => training.unenroll('class-a', tid, 24)));
        assert.equal(removed.filter(Boolean).length, 1);
        assert.equal(await training.unenroll('class-a', tid, 24), false);
        assert.equal((await doc()).attend, 0);
        assert.equal(await statuses.countDocuments(scope()), 1);
    });

    it('does not create a status for a learner who never enrolled', async () => {
        assert.equal(await training.unenroll('class-a', tid, 99), false);
        assert.equal(await statuses.countDocuments({}), 0);
        assert.equal((await doc()).attend, 0);
    });

    it('does not touch a different domain, training, or document type', async () => {
        await addExisting();
        const otherTid = new ObjectId();
        await collection.insertOne({ ...scope('class-b'), attend: 1, dag: [] });
        await statuses.insertMany([
            { ...scope('class-b'), uid: 24, enroll: 1 },
            { ...scope('class-a', otherTid), uid: 24, enroll: 1 },
            { ...scope(), docType: 10, uid: 24, enroll: 1 },
        ]);
        await training.unenroll('class-a', tid, 24);
        assert.equal(await statuses.countDocuments({ enroll: 1 }), 3);
        assert.equal((await collection.findOne(scope('class-b'))).attend, 1);
    });

    it('deduplicates concurrent re-enrollment so the count increments once', async () => {
        await addExisting();
        await training.unenroll('class-a', tid, 24);
        const results = await Promise.allSettled(Array.from({ length: 10 }, () => training.enroll('class-a', tid, 24)));
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal((await doc()).attend, 1);
    });

    it('keeps an enroll/remove race balanced even when the remove counter writes first', async () => {
        let release; let entered;
        const blocked = new Promise((resolve) => { entered = resolve; });
        const gate = new Promise((resolve) => { release = resolve; });
        interceptCounter = async ([query, pipeline]) => {
            if (pipeline[0].$set.enrollmentCountBalance.$add[1] === 1) { entered(); await gate; }
        };
        const joining = training.enroll('class-a', tid, 24);
        await blocked;
        assert.equal(await training.unenroll('class-a', tid, 24), true);
        assert.equal((await doc()).attend, 0);
        release();
        await joining;
        assert.equal((await doc()).attend, 0);
        assert.equal((await doc()).enrollmentCountBalance, 0);
        assert.equal((await training.getStatus('class-a', tid, 24)).enroll, 0);
    });

    it('keeps removal/re-enrollment balanced when re-enroll counter writes first', async () => {
        await addExisting();
        let release; let entered;
        const blocked = new Promise((resolve) => { entered = resolve; });
        const gate = new Promise((resolve) => { release = resolve; });
        interceptCounter = async ([query, pipeline]) => {
            if (pipeline[0].$set.enrollmentCountBalance.$add[1] === -1) { entered(); await gate; }
        };
        const removing = training.unenroll('class-a', tid, 24);
        await blocked;
        await training.enroll('class-a', tid, 24);
        release();
        await removing;
        assert.equal((await doc()).attend, 1);
        assert.equal((await training.getStatus('class-a', tid, 24)).enroll, 1);
    });

    it('keeps the real participant count nonnegative even on an inconsistent legacy baseline', async () => {
        await addExisting(24, 0);
        assert.equal(await training.unenroll('class-a', tid, 24), true);
        assert.equal((await doc()).attend, 0);
    });

    it('subtracts removals from a configured display baseline and retains its synthetic offset', () => {
        for (const [attend, expected] of [[12, 102], [10, 100], [9, 99], [0, 90]]) {
            assert.equal(training.getDisplayAttend({ attend, initialAttendCount: 100, initialAttendActualCount: 10 }), expected);
        }
        assert.equal(training.getDisplayAttend({ attend: 0, initialAttendCount: 2, initialAttendActualCount: 10 }), 0);
        assert.equal(training.getDisplayAttend({ attend: 5 }), 5);
    });
});
