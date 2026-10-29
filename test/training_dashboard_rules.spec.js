const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const moduleFixture = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.resolve(__dirname, '../packages/hydrooj/src/lib/training_dashboard.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: moduleFixture, exports: moduleFixture.exports, require });
const rules = moduleFixture.exports;
const now = new Date('2026-10-25T04:00:00Z');
test('recent periods use Shanghai calendar days including today', () => {
    const range = rules.trainingRange({ period: '7d' }, now);
    assert.equal(range.start.format('YYYY-MM-DD'), '2026-10-19');
    assert.equal(range.end.format('YYYY-MM-DD'), '2026-10-25');
    assert.equal(rules.trainingRange({ period: 'thisWeek' }, now).start.format('YYYY-MM-DD'), '2026-10-19');
    assert.equal(rules.trainingRange({ period: 'thisMonth' }, now).start.format('YYYY-MM-DD'), '2026-10-01');
});
test('invalid, future, inverted and overly large custom ranges are rejected', () => {
    for (const dates of [['2026-02-30', '2026-10-25'], ['2026-10-25', '2026-10-26'], ['2026-10-25', '2026-10-24'], ['2020-01-01', '2026-10-25']]) {
        assert.throws(() => rules.trainingRange({ period: 'custom', start: dates[0], end: dates[1] }, now));
    }
    assert.throws(() => rules.trainingRange({ period: ['7d'] }, now));
});
test('domain choices support merged and separate with no unauthorized ids', () => {
    assert.deepEqual(Array.from(rules.trainingDomainSelection('cpp,python,cpp', ['python', 'cpp']).ids), ['python', 'cpp']);
    assert.equal(rules.trainingDomainSelection(['cpp', 'all'], ['python', 'cpp']).all, true);
    assert.throws(() => rules.trainingDomainSelection(['all', 'another-school'], ['python', 'cpp']));
    assert.throws(() => rules.trainingDomainSelection({ $ne: null }, ['python', 'cpp']));
});
test('weekly averages exclude launch partial week and unfinished current week', () => {
    assert.equal(rules.trainingAverageWindow(new Date('2026-10-24T10:00:00+08:00'), now).weeks, 0);
    const range = rules.trainingAverageWindow(new Date('2026-10-01T10:00:00+08:00'), now);
    assert.equal(range.weeks, 2);
    assert.equal(range.start.format('YYYY-MM-DD'), '2026-10-05');
    assert.equal(range.end.format('YYYY-MM-DD'), '2026-10-19');
    assert.equal(rules.trainingAverageWindow(new Date('2026-01-01'), now).weeks, 4);
});
test('calendar-aligned deployment counts a complete week; no launch date means no invented average', () => {
    assert.equal(rules.trainingAverageWindow(new Date('2026-10-05T00:00:00+08:00'), now).weeks, 2);
    assert.equal(rules.trainingAverageWindow(null, now).weeks, 0);
});
test('duration format does not round away small training or add fictitious minutes', () => {
    assert.equal(rules.trainingDuration(59), '不足 1 分钟');
    assert.equal(rules.trainingDuration(3601), '1 小时');
    assert.equal(rules.trainingDuration(3660), '1 小时 1 分钟');
    assert.equal(rules.trainingDuration(0), '0 分钟');
});
test('uncertain durations show outward-rounded bounds without implying an exact split', () => {
    assert.equal(rules.trainingDurationRange(181.882, 446.173), '3～8 分钟');
    assert.equal(rules.trainingDurationRange(7381.882, 7646.173), '2 小时 3～8 分钟');
    assert.equal(rules.trainingDurationRange(3599, 3601), '59 分钟～1 小时 1 分钟');
    assert.equal(rules.trainingDurationRange(59, 59), '不足 1 分钟');
    assert.equal(rules.trainingDurationRange(0, 600), '0～10 分钟');
});
test('historical point estimates have an approximation marker while measured values keep their precision policy', () => {
    assert.equal(rules.trainingDurationEstimate(348.892, true), '约 6 分钟');
    assert.equal(rules.trainingDurationEstimate(7548.892, true), '约 2 小时 6 分钟');
    assert.equal(rules.trainingDurationEstimate(348.892, false), '5 分钟');
    assert.equal(rules.trainingDurationEstimate(30, true), '约不足 1 分钟');
    assert.equal(rules.trainingDurationEstimate(0, true), '0 分钟');
});
test('attention requires both meaningful time and attempts, never no AC alone', () => {
    assert.equal(rules.trainingAttention(1800, 3, 0).kind, 'stuck');
    assert.equal(rules.trainingAttention(1800, 3, 1).kind, 'normal');
    assert.equal(rules.trainingAttention(60, 3, 0).kind, 'normal');
    assert.equal(rules.trainingAttention(0, 0, 0).kind, 'quiet');
});
test('daily chart fills missing dates and has stable zero-length bars', () => {
    const range = rules.trainingRange({ period: '7d' }, now);
    const rows = rules.trainingDailyBars(range.start, range.end, { '2026-10-23': 3600 });
    assert.equal(rows.length, 7);
    assert.equal(rows[4].barPercent, 100);
    assert.equal(rows[5].seconds, 0);
    assert.equal(rows[5].barPercent, 0);
});
