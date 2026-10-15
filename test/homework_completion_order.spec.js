const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const { ObjectId } = require('mongodb');

const STATUS = { STATUS_ACCEPTED: 1, STATUS_WRONG_ANSWER: 2 };
const ridAt = (date) => ObjectId.createFromTime(Date.parse(date) / 1000);
const source = fs.readFileSync(path.resolve(__dirname, '../packages/hydrooj/src/handler/homework.ts'), 'utf8');
const section = source.slice(source.indexOf('const HOMEWORK_NO_DEADLINE'), source.indexOf('class HomeworkDetailHandler'));
const code = transformSync(`${section}\nmodule.exports = { HomeworkMainHandler };`, {
    loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).code;
const assignment = (n, title, pids = [1]) => ({
    docId: new ObjectId(`6000000000000000000000${String(n).padStart(2, '0')}`),
    title, pids, assignedUsers: [20, 21],
});
const accepted = (pid, date) => ({ pid, rid: ridAt(date), status: STATUS.STATUS_ACCEPTED });
const status = (tdoc, journal, uid = 20) => ({
    uid, docId: tdoc.docId, attend: 1, journal,
    detail: Object.fromEntries(journal.map((entry) => [entry.pid, entry])),
});
async function studentsFor(tdocs, statuses) {
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module, ObjectId, STATUS, Handler: class {}, Types: {}, param: () => () => {},
        PERM: { PERM_VIEW_USER_PRIVATE_INFO: 1 },
        contest: {
            getMulti: () => ({ sort: () => ({ toArray: async () => tdocs }) }),
            getMultiStatus: () => ({ toArray: async () => statuses }),
        },
        user: { getListForRender: async () => ({ 20: { uname: 'Student A' }, 21: { uname: 'Student B' } }) },
    });
    const handler = new module.exports.HomeworkMainHandler();
    handler.user = { hasPerm: () => false };
    return (await handler.getStudentHomeworkProgress('system', {})).students;
}
const names = (rows) => Array.from(rows, (row) => row.title);

test('completed homework follows each learner completion time, not title or assignment order', async () => {
    const old = assignment(1, 'Z old');
    const recent = assignment(2, 'A recent');
    const students = await studentsFor([old, recent], [
        status(old, [accepted(1, '2026-10-01')]), status(recent, [accepted(1, '2026-10-12')]),
        status(old, [accepted(1, '2026-10-14')], 21), status(recent, [accepted(1, '2026-10-03')], 21),
    ]);
    assert.deepEqual(names(students.find((s) => s.uid === 20).completedAssignments), ['A recent', 'Z old']);
    assert.deepEqual(names(students.find((s) => s.uid === 21).completedAssignments), ['Z old', 'A recent']);
});

test('last required first acceptance determines completion; repeated answers and removed problems do not bump it', async () => {
    const old = assignment(1, 'A old', [1, 2]);
    const recent = assignment(2, 'Z recent');
    const students = await studentsFor([old, recent], [
        status(old, [
            accepted(1, '2026-10-01'), accepted(2, '2026-10-05'),
            accepted(1, '2026-10-14'), accepted(999, '2026-10-15'),
        ]),
        status(recent, [accepted(1, '2026-10-10')]),
    ]);
    const rows = students.find((s) => s.uid === 20).completedAssignments;
    assert.deepEqual(names(rows), ['Z recent', 'A old']);
    assert.equal(rows[1].completedAt, Date.parse('2026-10-05'));
});

test('legacy detail timestamps work; unknown dates are last and ties have stable ordering', async () => {
    const legacy = assignment(1, 'Legacy');
    const unknown = assignment(2, 'Unknown');
    const sameTime = assignment(3, 'Same time');
    const legacyStatus = status(legacy, [accepted(1, '2026-10-10')]);
    delete legacyStatus.journal;
    legacyStatus.detail[1].rid = legacyStatus.detail[1].rid.toHexString();
    const students = await studentsFor([unknown, legacy, sameTime], [
        legacyStatus,
        { ...status(unknown, []), detail: { 1: { status: STATUS.STATUS_ACCEPTED, rid: 'invalid' } } },
        status(sameTime, [accepted(1, '2026-10-10')]),
    ]);
    assert.deepEqual(names(students.find((s) => s.uid === 20).completedAssignments), ['Same time', 'Legacy', 'Unknown']);
});

test('incomplete and empty assignments stay out of completed list, including a latest failed answer', async () => {
    const partial = assignment(1, 'Partial', [1, 2]);
    const empty = assignment(2, 'Empty', []);
    const failed = assignment(3, 'Failed');
    const done = assignment(4, 'Done');
    const students = await studentsFor([done, partial, empty, failed], [
        status(partial, [accepted(1, '2026-10-15')]), status(empty, []),
        status(failed, [accepted(1, '2026-10-01'), { ...accepted(1, '2026-10-15'), status: STATUS.STATUS_WRONG_ANSWER }]),
        status(done, [accepted(1, '2026-10-10')]),
    ]);
    const student = students.find((s) => s.uid === 20);
    assert.deepEqual(names(student.completedAssignments), ['Done']);
    assert.deepEqual(names(student.incompleteAssignments), ['Empty', 'Failed', 'Partial']);
    assert.equal(student.completedHomeworks, 1);
});
