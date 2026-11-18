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
const row = (intervals, { uid = 101, domainId = 'python', day = '2026-10-27', seconds, sources,
    startedAt, updatedAt = new Date(at(20)) } = {}) => ({
    uid, domainId, day, intervals, startedAt, updatedAt,
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

test('legacy daily counters use bounds instead of declaring unknown classroom overlap autonomous', () => {
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
    assert.equal(old.students[0].seconds, 3600);
    assert.equal(old.students[0].trainingSeconds, 0);
    assert.equal(old.students[0].trainingUpperSeconds, 1800);
    assert.equal(old.students[0].uncertainSeconds, 1800);
    assert.equal(old.legacySeconds, 1800);
});

test('malformed spans never add time or fabricate intervals from daily timestamps', () => {
    const result = merged([row([], { seconds: 600 })], [lesson(11, 10), lesson(NaN, 11), lesson(9, 10)]);
    assert.equal(result.students[0].seconds, 3600);
    assert.equal(result.students[0].trainingUpperSeconds, 600);
    assert.equal(result.students[0].legacySeconds, 600);
    assert.equal(merged([], [], 2, 1).students.length, 0);
});

test('historical windows wholly inside or outside a lesson can be classified exactly across classrooms', () => {
    const inside = row([], { domainId: 'python', seconds: 1200, startedAt: new Date(at(10.1)), updatedAt: new Date(at(10.9)),
        sources: [{ kind: 'problem', pid: 7, seconds: 1200 }] });
    const outside = row([], { domainId: 'cpp', seconds: 600, startedAt: new Date(at(12)), updatedAt: new Date(at(12.5)),
        sources: [{ kind: 'problem', pid: 8, seconds: 600 }] });
    const result = merged([inside, outside], [lesson(10, 11, 'cpp')]);
    assert.equal(result.students[0].trainingSeconds, 600);
    assert.equal(result.students[0].trainingUpperSeconds, 600);
    assert.equal(result.students[0].uncertainSeconds, 0);
    assert.equal(result.students[0].overlapSeconds, 1200);
    assert.equal(result.sources.find((item) => item.pid === 7).classTrainingSeconds, 1200);
    assert.equal(result.sources.find((item) => item.pid === 8).seconds, 600);
});

test('the historical 25 October case reports only provable post-class bounds, not a fabricated allocation', () => {
    const cpp = row([], { domainId: 'cpp', seconds: 2780.026,
        startedAt: new Date(at(19) + 18 * 60000 + 28000), updatedAt: new Date(at(21) + 112709),
        sources: [{ kind: 'problem', pid: 1, seconds: 2780.026 }] });
    const python = row([], { domainId: 'python', seconds: 947.863,
        startedAt: new Date(at(21) + 134019), updatedAt: new Date(at(21) + 1346173),
        sources: [{ kind: 'problem', pid: 2, seconds: 947.863 }] });
    const result = merged([cpp, python], [lesson(19.25, 21.25, 'cpp')]);
    const student = result.students[0];
    assert.ok(Math.abs(student.trainingSeconds - 181.882) < 0.000001);
    assert.ok(Math.abs(student.trainingUpperSeconds - 446.173) < 0.000001);
    assert.ok(Math.abs(student.uncertainSeconds - 264.291) < 0.000001);
    assert.equal(student.classSeconds, 7200);
    assert.ok(Math.abs(student.seconds - 7381.882) < 0.000001);
    assert.ok(Math.abs(student.trainingEstimatedSeconds - 348.8920370670723) < 0.000001);
    assert.ok(Math.abs(student.estimatedSeconds - 7548.892037067072) < 0.000001);
    assert.equal(student.hasEstimate, true);
    assert.equal(student.estimationMethod, 'activity-window');
    assert.equal(result.sources.find((item) => item.pid === 1).seconds, 0);
    assert.equal(result.sources.find((item) => item.pid === 1).classTrainingSeconds, 2780.026);
    const source = result.sources.find((item) => item.pid === 2);
    assert.ok(Math.abs(source.seconds - 181.882) < 0.000001);
    assert.ok(Math.abs(source.trainingUpperSeconds - 446.173) < 0.000001);
    assert.ok(source.classTrainingUpperSeconds > source.classTrainingSeconds);
    assert.ok(Math.abs(source.estimatedSeconds - student.trainingEstimatedSeconds) < 0.000001);
    assert.ok(Math.abs(source.classTrainingEstimatedSeconds - 598.9709629329277) < 0.000001);
});

test('point estimates reuse the counter proportions across sources and preserve exact measured activity', () => {
    const result = merged([row([span(9, 9.5, 'problem', 1)], {
        seconds: 5400, startedAt: new Date(at(9)), updatedAt: new Date(at(11)),
        sources: [{ kind: 'problem', pid: 1, seconds: 3000 }, { kind: 'problem', pid: 2, seconds: 2400 }],
    })], [lesson(9.5, 10.5)]);
    const student = result.students[0];
    assert.equal(student.trainingEstimatedSeconds, 3000);
    assert.equal(student.overlapEstimatedSeconds, 2400);
    assert.equal(student.estimatedSeconds, 6600);
    assert.equal(student.unattributedEstimatedSeconds, 0);
    assert.equal(result.sources.find((source) => source.pid === 1).estimatedSeconds, 2200);
    assert.equal(result.sources.find((source) => source.pid === 2).estimatedSeconds, 800);
    assert.equal(result.sources.reduce((total, source) => total + source.estimatedSeconds, 0), student.trainingEstimatedSeconds);
    assert.equal(result.sources.reduce((total, source) => total + source.classTrainingEstimatedSeconds, 0), student.overlapEstimatedSeconds);
    assert.equal(result.domains.reduce((total, domain) => total + domain.estimatedSeconds, 0), student.estimatedSeconds);
    assert.equal(result.days.reduce((total, day) => total + day.estimatedSeconds, 0), student.estimatedSeconds);
    const precise = merged([row([span(9, 11)])], [lesson(10, 11)]).students[0];
    assert.equal(precise.trainingEstimatedSeconds, precise.trainingSeconds);
    assert.equal(precise.overlapEstimatedSeconds, precise.overlapSeconds);
    assert.equal(precise.estimatedSeconds, precise.seconds);
    assert.equal(precise.hasEstimate, false);
    assert.equal(precise.estimationMethod, undefined);
});

test('missing or inconsistent activity windows use a feasible midpoint rather than an all-day activity assumption', () => {
    for (const input of [row([], { seconds: 600 }), row([], { seconds: 600,
        startedAt: new Date(at(10)), updatedAt: new Date(at(10) + 1000) })]) {
        const student = merged([input], [lesson(10, 11)]).students[0];
        assert.equal(student.trainingEstimatedSeconds, 300);
        assert.equal(student.overlapEstimatedSeconds, 300);
        assert.equal(student.hasEstimate, true);
        assert.equal(student.estimationMethod, 'bounds-midpoint');
        assert.ok(student.trainingEstimatedSeconds >= student.trainingSeconds);
        assert.ok(student.trainingEstimatedSeconds <= student.trainingUpperSeconds);
    }
    const inside = merged([row([], { seconds: 600, startedAt: new Date(at(10)), updatedAt: new Date(at(11)) })], [lesson(10, 11)]).students[0];
    assert.equal(inside.trainingEstimatedSeconds, 0);
    assert.equal(inside.overlapEstimatedSeconds, 600);
    assert.equal(inside.hasEstimate, false);
});

test('incomplete source attribution is explicit and inconsistent source counters cannot inflate estimated totals', () => {
    const partial = merged([row([], { seconds: 3600, startedAt: new Date(at(9)), updatedAt: new Date(at(11)),
        sources: [{ kind: 'problem', pid: 1, seconds: 1800 }] })], [lesson(9, 10)]);
    const student = partial.students[0];
    assert.equal(student.trainingEstimatedSeconds, 1800);
    assert.equal(student.unattributedEstimatedSeconds, 900);
    assert.equal(student.unattributedClassTrainingEstimatedSeconds, 900);
    assert.equal(partial.sources[0].estimatedSeconds + student.unattributedEstimatedSeconds, student.trainingEstimatedSeconds);
    assert.equal(partial.sources[0].classTrainingEstimatedSeconds + student.unattributedClassTrainingEstimatedSeconds,
        student.overlapEstimatedSeconds);
    const inflated = merged([row([], { seconds: 3600, startedAt: new Date(at(9)), updatedAt: new Date(at(11)),
        sources: [{ kind: 'problem', pid: 1, seconds: 3600 }, { kind: 'problem', pid: 2, seconds: 3600 }] })], []);
    assert.equal(inflated.students[0].trainingEstimatedSeconds, 3600);
    assert.equal(inflated.sources.reduce((total, source) => total + source.estimatedSeconds, 0), 3600);
    assert.ok(inflated.sources.every((source) => source.estimatedSeconds === 1800 && source.hasEstimate));
});

test('old counters from different classrooms share the same available lesson and independent time', () => {
    // The Python hour may fall anywhere between 09:00–11:00, but C++ already
    // used 50 of the first 60 minutes. At most ten more fit in the same hour.
    const old = (domainId, seconds, start, end) => row([], {
        domainId, seconds, startedAt: new Date(at(start)), updatedAt: new Date(at(end)),
        sources: [{ kind: 'problem', pid: 1, seconds }],
    });
    const rows = [old('python', 3600, 9, 11), old('cpp', 3000, 9, 10)];
    for (const [start, end, expected] of [[9, 10, 3000], [10, 11, 3600]]) {
        const result = merged(rows, [lesson(start, end)]);
        const student = result.students[0];
        assert.equal(student.trainingEstimatedSeconds, expected);
        assert.equal(student.trainingEstimatedSeconds + student.overlapEstimatedSeconds, 6600);
        assert.ok(student.overlapEstimatedSeconds <= student.classSeconds);
        assert.equal(result.sources.reduce((total, item) => total + item.estimatedSeconds, 0), expected);
        assert.equal(result.domains.reduce((total, item) => total + item.trainingEstimatedSeconds, 0), expected);
        const python = result.sources.find((item) => item.domainId === 'python');
        assert.ok(python.estimatedSeconds >= python.seconds && python.estimatedSeconds <= python.trainingUpperSeconds);
        assert.equal(merged([...rows].reverse(), [lesson(start, end)]).students[0].trainingEstimatedSeconds, expected);
    }
});

test('an unrelated afternoon lesson cannot provide capacity to two morning counters', () => {
    const ledger = (domainId, seconds, start, end) => row([], {
        domainId, seconds, startedAt: new Date(at(start)), updatedAt: new Date(at(end)),
        sources: [{ kind: 'problem', pid: 1, seconds }],
    });
    const result = merged([
        ledger('A', 3600, 9, 11), ledger('B', 3000, 9, 10),
        ledger('C', 60, 10, 13), ledger('D', 600, 12, 15),
    ], [lesson(9, 10), lesson(12, 15)]);
    const morning = result.sources.filter((item) => ['A', 'B'].includes(item.domainId));
    const inClass = morning.reduce((total, item) => total + item.classTrainingEstimatedSeconds, 0);
    assert.ok(inClass <= 3600 + 0.000001);
    assert.ok(inClass >= 3000);
});

test('multi-class historical estimates fit independently checked capacity for every subset of learners classrooms', () => {
    let seed = 637;
    const random = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    const units = 16;
    const unitSeconds = 300;
    const hour = (unit) => 9 + unit / 12;
    for (let attempt = 0; attempt < 100; attempt++) {
        const owners = Array.from({ length: units }, () => random(5));
        const inClass = Array.from({ length: units }, () => random(7) < 3);
        const windows = [];
        for (let id = 0; id < 4; id++) {
            const first = owners.indexOf(id);
            if (first === -1) continue;
            const last = owners.lastIndexOf(id) + 1;
            windows.push({ domainId: String(id), start: first - random(first + 1), end: last + random(units - last + 1),
                seconds: owners.filter((v) => v === id).length * unitSeconds });
        }
        const rows = windows.map((w) => row([], { domainId: w.domainId, seconds: w.seconds,
            startedAt: new Date(at(hour(w.start))), updatedAt: new Date(at(hour(w.end))),
            sources: [{ kind: 'problem', pid: 1, seconds: w.seconds }] }));
        const lessons = inClass.flatMap((value, unit) => value ? [lesson(hour(unit), hour(unit + 1))] : []);
        const result = merged(rows, lessons);
        for (let mask = 1; mask < (1 << windows.length); mask++) {
            const selected = windows.filter((_, id) => (mask & (1 << id)) !== 0);
            const estimates = result.sources.filter((source) => selected.some((w) => w.domainId === source.domainId));
            const supported = inClass.filter((_, unit) => selected.some((w) => w.start <= unit && unit < w.end));
            const overlap = estimates.reduce((n, source) => n + source.classTrainingEstimatedSeconds, 0);
            const training = estimates.reduce((n, source) => n + source.estimatedSeconds, 0);
            assert.ok(overlap <= supported.filter(Boolean).length * unitSeconds + 0.000001);
            assert.ok(training <= supported.filter((isClass) => !isClass).length * unitSeconds + 0.000001);
            assert.ok(Math.abs(training + overlap - selected.reduce((n, w) => n + w.seconds, 0)) < 0.000001);
        }
    }
});

test('known precise activity cannot be reused as capacity for unrecorded historical time', () => {
    const input = row([span(9, 10)], { seconds: 7200, startedAt: new Date(at(9)), updatedAt: new Date(at(12)),
        sources: [{ kind: 'problem', pid: 1, seconds: 7200 }] });
    const result = merged([input], [lesson(9, 11)]);
    assert.equal(result.students[0].trainingSeconds, 0);
    assert.equal(result.students[0].trainingUpperSeconds, 3600);
    assert.equal(result.students[0].overlapSeconds, 3600);
    assert.equal(result.students[0].overlapUpperSeconds, 7200);
    const allClass = merged([input], [lesson(9, 12)]);
    assert.equal(allClass.students[0].trainingUpperSeconds, 0);
    assert.equal(allClass.students[0].overlapSeconds, 7200);
});

test('historical query clipping accounts for unknown activity outside the requested window', () => {
    const input = row([], { seconds: 5400, startedAt: new Date(at(9)), updatedAt: new Date(at(12)),
        sources: [{ kind: 'problem', pid: 1, seconds: 5400 }] });
    const result = merged([input], [], 10, 11);
    assert.equal(result.students[0].trainingSeconds, 0);
    assert.equal(result.students[0].trainingUpperSeconds, 3600);
    const large = merged([row([], { seconds: 9000, startedAt: new Date(at(9)), updatedAt: new Date(at(12)) })], [], 10, 11);
    assert.equal(large.students[0].trainingSeconds, 1800);
    assert.equal(large.students[0].trainingUpperSeconds, 3600);
});

test('a single trustworthy endpoint still rules out class or query overlap for an old counter', () => {
    const ended = row([], { seconds: 600, updatedAt: new Date(at(10)) });
    const result = merged([ended], [lesson(11, 12)], 0, 12).students[0];
    assert.equal(result.trainingSeconds, 600);
    assert.equal(result.trainingEstimatedSeconds, 600);
    assert.equal(result.overlapUpperSeconds, 0);
    assert.equal(result.hasEstimate, false);
    const started = { ...ended, startedAt: new Date(at(14)), updatedAt: undefined };
    assert.equal(merged([started], [lesson(12, 13)]).students[0].trainingSeconds, 600);
    assert.equal(merged([started], [], 0, 12).students[0]?.trainingUpperSeconds || 0, 0);
});

test('missing or impossible historical envelopes never invent exact independent practice around lessons', () => {
    const missing = merged([row([], { seconds: 600, updatedAt: undefined })], [lesson(10, 11)]);
    assert.equal(missing.students[0].trainingSeconds, 0);
    assert.equal(missing.students[0].trainingUpperSeconds, 600);
    const impossible = merged([row([], { seconds: 600, startedAt: new Date(at(10)), updatedAt: new Date(at(10) + 1000) })], [lesson(10, 11)]);
    assert.equal(impossible.students[0].trainingSeconds, 0);
    assert.equal(impossible.students[0].trainingUpperSeconds, 600);
    const noClass = merged([row([], { seconds: 600 })], []);
    assert.equal(noClass.students[0].trainingSeconds, 600);
    assert.equal(noClass.students[0].trainingUpperSeconds, 600);
});

test('all authorized lessons mask a selected classroom even when only selected lessons contribute totals', () => {
    const rows = [row([span(9, 12)], { domainId: 'python' })];
    const lessons = [lesson(10, 11, 'cpp')];
    const result = mergeLearningTime(rows, lessons, at(0), at(24), { classDomainIds: ['python'] });
    assert.equal(result.students[0].trainingSeconds, 7200);
    assert.equal(result.students[0].classSeconds, 0);
    assert.equal(result.students[0].overlapSeconds, 3600);
    assert.equal(result.domains.some((item) => item._id === 'cpp'), false);
    const historical = mergeLearningTime([row([], { domainId: 'python', seconds: 1200,
        startedAt: new Date(at(10)), updatedAt: new Date(at(11)) })], lessons, at(0), at(24), { classDomainIds: ['python'] });
    assert.equal(historical.students[0].trainingSeconds, 0);
    assert.equal(historical.students[0].trainingUpperSeconds, 0);
    assert.equal(historical.students[0].classSeconds, 0);
    assert.equal(historical.students[0].overlapSeconds, 1200);
});

test('source bounds are independent and are never a proportional split of the daily counter', () => {
    const result = merged([row([], { seconds: 5400, startedAt: new Date(at(9)), updatedAt: new Date(at(11)),
        sources: [{ kind: 'problem', pid: 1, seconds: 2700 }, { kind: 'problem', pid: 2, seconds: 2700 }] })], [lesson(9, 10)]);
    assert.equal(result.students[0].trainingSeconds, 1800);
    assert.equal(result.students[0].trainingUpperSeconds, 3600);
    assert.equal(result.sources.reduce((total, item) => total + item.seconds, 0), 0);
    assert.ok(result.sources.every((item) => item.trainingUpperSeconds === 2700));
});

test('sources retain separate autonomous and teacher-led practice durations', () => {
    const result = merged([row([span(9, 10, 'problem', 7), span(10, 11, 'daily', 7), span(11, 12, 'ide', 0)])], [lesson(9.5, 11.5)]);
    const actual = Object.fromEntries(result.sources.map((source) => [`${source.kind}:${source.pid}`, [source.seconds, source.classTrainingSeconds]]));
    assert.deepEqual(actual, { 'problem:7': [1800, 1800], 'daily:7': [0, 3600], 'ide:0': [1800, 1800] });
});

test('1,000 seeded schedules reconcile exact and historical ledgers against independent second-by-second activity', () => {
    const anchors = ['2026-05-31', '2026-11-01', '2023-12-31', '2026-11-18'];
    const domains = ['python', 'cpp'];
    const learners = [101, 102];
    for (let run = 0; run < 1000; run++) {
        let seed = Math.imul(20261118 + run, 0x9e3779b1) >>> 0;
        const random = (n) => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return Math.floor(seed * n / 0x100000000);
        };
        // Includes a Sunday/Monday month rollover and a Sunday/Monday year rollover.
        const start = Date.parse(anchors[run % anchors.length] + 'T23:59:30+08:00');
        const stamp = (second) => start + second * 1000;
        const dayAt = (second) => new Date(stamp(second) + 8 * 3600_000).toISOString().slice(0, 10);
        const selected = [[0], [1], [0, 1]][run % 3];
        const [from, to] = [[0, 60], [0, 30], [30, 60], [random(29), 31 + random(30)]][Math.floor(run / 4) % 4];
        const lessons = [];
        const traces = new Map();
        for (const uid of learners) {
            const classes = Array.from({ length: 60 }, () => new Set());
            const addLesson = (domain, begin, end) => {
                lessons.push({ uid, domainId: domains[domain], startAt: new Date(stamp(begin)), endAt: new Date(stamp(end)) });
                for (let t = begin; t < end; t++) classes[t].add(domain);
            };
            addLesson(0, 26, 34);
            addLesson(0, 26, 34);
            addLesson(1, 28, 32);
            for (let i = 0; i < 5; i++) {
                const begin = random(55);
                addLesson(random(2), begin, Math.min(60, begin + 1 + random(16)));
            }
            let owner = random(3);
            const activity = Array.from({ length: 60 }, () => {
                if (random(4) === 0) owner = random(3);
                return owner; // 0 and 1 are classrooms, 2 is idle.
            });
            traces.set(uid, { activity, classes });
        }
        for (const legacy of [false, true]) {
            const rows = [];
            const totals = new Map();
            const addSecond = (key, training, overlap, classroom) => {
                const value = totals.get(key) || { training: 0, overlap: 0, classroom: 0 };
                value.training += Number(training); value.overlap += Number(overlap); value.classroom += Number(classroom);
                totals.set(key, value);
            };
            for (const [uid, { activity, classes }] of traces) {
                // Exact ledgers also include simultaneous readings from different tabs.
                // Historical counters use a single owner so the hidden ground truth is physically possible.
                const active = (domain, t) => activity[t] === domain || (!legacy && uid === 101 && t >= 25 && t < 35);
                for (let t = from; t < to; t++) {
                    const training = selected.some((domain) => active(domain, t));
                    const inClass = classes[t].size > 0;
                    const visibleClass = selected.some((domain) => classes[t].has(domain));
                    for (const key of [uid, dayAt(t)]) addSecond(key, training && !inClass, training && inClass, visibleClass);
                }
                for (const domain of selected) for (const begin of [0, 30]) {
                    const end = begin + 30;
                    const spans = [];
                    for (let t = begin; t < end;) {
                        if (!active(domain, t)) { t++; continue; }
                        const first = t++;
                        while (t < end && active(domain, t)) t++;
                        spans.push({ kind: 'problem', pid: 1, start: stamp(first), end: stamp(t) });
                    }
                    if (!spans.length) continue;
                    const seconds = spans.reduce((n, s) => n + (s.end - s.start) / 1000, 0);
                    const intervals = legacy ? spans.filter(() => random(3) === 0) : spans;
                    rows.push(row(intervals, {
                        uid, domainId: domains[domain], day: dayAt(begin), seconds,
                        sources: [{ kind: 'problem', pid: 1, seconds }],
                        startedAt: legacy && random(4) === 0 ? undefined : new Date(stamp(begin)),
                        updatedAt: legacy && random(4) === 0 ? null : new Date(stamp(end)),
                    }));
                }
            }
            const result = mergeLearningTime(rows, lessons, stamp(from), stamp(to), {
                classDomainIds: selected.map((d) => domains[d]), observedAt: stamp(60),
            });
            for (const [key, expected] of totals) {
                const group = typeof key === 'number' ? result.students : result.days;
                const actual = group.find((entry) => entry._id === key) || {};
                const context = 'seed ' + (20261118 + run) + ', legacy ' + legacy + ', key ' + key;
                assert.equal(actual.classSeconds || 0, expected.classroom, context);
                for (const [metric, groundTruth] of [['training', expected.training], ['overlap', expected.overlap]]) {
                    const lower = actual[metric + 'Seconds'] || 0;
                    const upper = actual[metric + 'UpperSeconds'] || 0;
                    const estimate = actual[metric + 'EstimatedSeconds'] || 0;
                    if (legacy) {
                        assert.ok(lower <= groundTruth + 1e-7 && groundTruth <= upper + 1e-7, context + ' ' + metric + ' bounds');
                        assert.ok(lower <= estimate + 1e-7 && estimate <= upper + 1e-7, context + ' ' + metric + ' estimate');
                    } else {
                        assert.deepEqual([lower, upper, estimate], [groundTruth, groundTruth, groundTruth], context + ' ' + metric);
                    }
                }
            }
            const total = learners.reduce((n, uid) => n + totals.get(uid).classroom + totals.get(uid).training, 0);
            const perDomain = (metric) => result.domains.reduce((n, d) => n + d[metric], 0);
            const context = 'domain totals for seed ' + (20261118 + run);
            if (legacy) assert.ok(perDomain('seconds') <= total && total <= perDomain('classSeconds') + perDomain('trainingUpperSeconds'), context);
            else assert.equal(perDomain('seconds'), total, context);
        }
    }
});

test('historical bounds and uniform-window estimates match an independent enumeration of feasible activity placements', () => {
    const units = 6;
    const popcount = (value) => value.toString(2).replaceAll('0', '').length;
    for (let run = 0; run < 64; run++) {
        const unknownUnits = 1 + (run % 5);
        const begin = run % 3;
        const end = 4 + (run % 3);
        const classMask = run;
        const classes = Array.from({ length: units }, (_, index) => ((classMask & (1 << index))
            ? lesson(9 + index / units, 9 + (index + 1) / units, index % 2 ? 'cpp' : 'python') : null)).filter(Boolean);
        const rows = [row([span(9, 9 + 1 / units)], { seconds: (unknownUnits + 1) * 600,
            startedAt: new Date(at(9)), updatedAt: new Date(at(10)) })];
        const possibilities = [];
        for (let mask = 0; mask < 1 << units; mask++) {
            if (mask & 1 || popcount(mask) !== unknownUnits) continue;
            let autonomous = 0;
            for (let index = begin; index < end; index++) {
                const active = index === 0 || (mask & (1 << index));
                if (active && !(classMask & (1 << index))) autonomous += 600;
            }
            possibilities.push(autonomous);
        }
        const result = merged(rows, classes, 9 + begin / units, 9 + end / units).students[0];
        assert.equal(Math.round(result.trainingSeconds), Math.min(...possibilities));
        assert.equal(Math.round(result.trainingUpperSeconds), Math.max(...possibilities));
        const mean = possibilities.reduce((total, value) => total + value, 0) / possibilities.length;
        assert.ok(Math.abs(result.trainingEstimatedSeconds - mean) < 0.000001);
    }
});

test('merging is read-only and stable for repeated dashboard loads', () => {
    const inputRows = [row([span(9, 12)])]; const inputLessons = [lesson(10, 11)];
    const before = JSON.stringify([inputRows, inputLessons]);
    assert.deepEqual(JSON.stringify(merged(inputRows, inputLessons)), JSON.stringify(merged(inputRows, inputLessons)));
    assert.equal(JSON.stringify([inputRows, inputLessons]), before);
});
