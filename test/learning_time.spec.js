const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');

function load(name, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module, exports: module.exports, Date, require: (id) => dependencies[id] ?? require(id) });
    return module.exports;
}
const clocks = load('packages/hydrooj/src/lib/training_time.ts');
const { mergeLearningTime } = load('packages/hydrooj/src/lib/learning_time.ts', { './training_time': clocks });
const base = Date.parse('2026-10-27T00:00:00+08:00');
const at = (hours) => base + hours * 3600_000;
const span = (from, to, kind = 'problem', pid = 1) => ({ start: at(from), end: at(to), kind, pid });
const lesson = (from, to, domainId = 'python', uid = 101) => ({ uid, domainId, startAt: new Date(at(from)), endAt: new Date(at(to)) });
const row = (intervals, { uid = 101, domainId = 'python', day = '2026-10-27', seconds, sources } = {}) => ({
    uid, domainId, day, intervals, updatedAt: new Date(at(20)),
    seconds: seconds ?? intervals.reduce((total, entry) => total + (entry.end - entry.start) / 1000, 0),
    sources: sources ?? intervals.map((entry) => ({ kind: entry.kind, pid: entry.pid, seconds: (entry.end - entry.start) / 1000 })),
});
const merged = (rows, lessons, from = 0, to = 24) => mergeLearningTime(rows, lessons, at(from), at(to));

test('partial overlap counts teacher-led practice only as class time', () => {
    const result = merged([row([span(9, 12)])], [lesson(10, 11.5)]);
    const student = result.students[0];
    assert.equal(student.seconds, 10800);
    assert.equal(student.trainingSeconds, 5400);
    assert.equal(student.classSeconds, 5400);
    assert.equal(student.overlapSeconds, 5400);
    assert.equal(result.sources[0].seconds, 5400);
    assert.equal(result.sources[0].classTrainingSeconds, 5400);
    assert.equal(result.days[0].seconds, 10800);
});

test('duplicate, nested and overlapping lessons form a single union per learner', () => {
    const classes = [lesson(10, 12), lesson(10, 12), lesson(10.5, 11), lesson(11, 13, 'cpp')];
    const result = merged([], classes);
    assert.equal(result.students[0].seconds, 10800);
    assert.equal(result.students[0].trainingSeconds, 0);
    assert.equal(result.students[0].classSeconds, 10800);
    assert.equal(result.domains.reduce((sum, domain) => sum + domain.seconds, 0), 10800);
    const reversed = merged([], [...classes].reverse());
    assert.deepEqual(JSON.parse(JSON.stringify(result.domains)), JSON.parse(JSON.stringify(reversed.domains)));
});

test('a lesson in one classroom masks training in another classroom for the same learner', () => {
    const result = merged([row([span(9, 12)])], [lesson(10, 11, 'cpp')]);
    assert.equal(result.students[0].trainingSeconds, 7200);
    assert.equal(result.students[0].classSeconds, 3600);
    assert.equal(result.domains.find((domain) => domain._id === 'python').trainingSeconds, 7200);
    assert.equal(result.domains.find((domain) => domain._id === 'cpp').classSeconds, 3600);
    const separate = merged([row([span(9, 12)])], [lesson(10, 11, 'cpp', 102)]);
    assert.equal(separate.students.find((student) => student._id === 101).trainingSeconds, 10800);
});

test('Shanghai midnight splits both lesson and overlap into the correct day', () => {
    const result = merged([
        row([span(23.5, 24)]),
        row([span(24, 24.5)], { day: '2026-10-28' }),
    ], [lesson(23, 25)], 0, 48);
    assert.equal(result.students[0].seconds, 7200);
    for (const day of result.days) {
        assert.equal(day.classSeconds, 3600);
        assert.equal(day.trainingSeconds, 0);
        assert.equal(day.overlapSeconds, 1800);
    }
    assert.deepEqual(Array.from(result.days.map((day) => day._id)).sort(), ['2026-10-27', '2026-10-28']);
});

test('query clipping uses exact half-open boundaries without importing outside time', () => {
    const result = merged([row([span(9, 12)])], [lesson(10, 11)], 10.5, 11.5);
    assert.equal(result.students[0].seconds, 3600);
    assert.equal(result.students[0].trainingSeconds, 1800);
    assert.equal(result.students[0].classSeconds, 1800);
    const adjacent = merged([row([span(9, 10)])], [lesson(10, 11)]);
    assert.equal(adjacent.students[0].seconds, 7200);
    assert.equal(adjacent.students[0].overlapSeconds, 0);
});

test('legacy daily counters remain visible, while new measured intervals can be de-duplicated', () => {
    const result = merged([row([span(10, 11)], { seconds: 7200, sources: [{ kind: 'problem', pid: 1, seconds: 7200 }] })], [lesson(10, 11)]);
    const student = result.students[0];
    assert.equal(student.seconds, 7200);
    assert.equal(student.trainingSeconds, 3600);
    assert.equal(student.classSeconds, 3600);
    assert.equal(student.overlapSeconds, 3600);
    assert.equal(student.legacySeconds, 3600);
    assert.equal(result.legacySeconds, 3600);
    assert.equal(result.sources[0].seconds, 3600);
    assert.equal(result.sources[0].classTrainingSeconds, 3600);
    const old = merged([row([], { seconds: 1800, sources: [{ kind: 'ide', pid: 0, seconds: 1800 }] })], [lesson(10, 11)]);
    assert.equal(old.students[0].seconds, 5400);
    assert.equal(old.legacySeconds, 1800);
});

test('malformed spans never add time or fabricate intervals from daily timestamps', () => {
    const result = merged([row([], { seconds: 600 })], [lesson(11, 10), lesson(NaN, 11), lesson(9, 10)]);
    assert.equal(result.students[0].seconds, 4200);
    assert.equal(result.students[0].legacySeconds, 600);
    assert.equal(merged([], [], 2, 1).students.length, 0);
});

test('sources retain separate autonomous and teacher-led practice durations', () => {
    const result = merged([row([span(9, 10, 'problem', 7), span(10, 11, 'daily', 7), span(11, 12, 'ide', 0)])], [lesson(9.5, 11.5)]);
    const actual = Object.fromEntries(result.sources.map((source) => [`${source.kind}:${source.pid}`, [source.seconds, source.classTrainingSeconds]]));
    assert.deepEqual(actual, { 'problem:7': [1800, 1800], 'daily:7': [0, 3600], 'ide:0': [1800, 1800] });
});

test('union and overlap match a discrete independent oracle across randomized schedules', () => {
    let seed = 217393;
    const random = (limit) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
    for (let run = 0; run < 150; run++) {
        const intervals = Array.from({ length: 6 }, (_, pid) => {
            const from = random(40);
            return span(from / 12, (from + 1 + random(8)) / 12, 'problem', pid + 1);
        });
        const classes = Array.from({ length: 8 }, () => {
            const from = random(40);
            return lesson(from / 12, (from + 1 + random(8)) / 12, random(2) ? 'cpp' : 'python');
        });
        const result = merged([row(intervals)], classes, 1, 3);
        let autonomous = 0; let classroom = 0; let overlap = 0;
        for (let unit = 12; unit < 36; unit++) {
            const point = at((unit + 0.5) / 12);
            const train = intervals.some((interval) => interval.start <= point && point < interval.end);
            const learn = classes.some((entry) => +entry.startAt <= point && point < +entry.endAt);
            if (learn) classroom += 300;
            if (train && !learn) autonomous += 300;
            if (train && learn) overlap += 300;
        }
        const student = result.students[0];
        assert.equal(Math.round(student.trainingSeconds), autonomous);
        assert.equal(Math.round(student.classSeconds), classroom);
        assert.equal(Math.round(student.overlapSeconds), overlap);
        assert.equal(Math.round(student.seconds), classroom + autonomous);
        assert.equal(Math.round(result.domains.reduce((sum, domain) => sum + domain.seconds, 0)), classroom + autonomous);
    }
});

test('merging is read-only and stable for repeated dashboard loads', () => {
    const inputRows = [row([span(9, 12)])]; const inputLessons = [lesson(10, 11)];
    const before = JSON.stringify([inputRows, inputLessons]);
    assert.deepEqual(JSON.stringify(merged(inputRows, inputLessons)), JSON.stringify(merged(inputRows, inputLessons)));
    assert.equal(JSON.stringify([inputRows, inputLessons]), before);
});
