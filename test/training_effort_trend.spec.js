const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const templates = path.resolve(__dirname, '../packages/ui-default/templates');
const views = new nunjucks.Environment(new nunjucks.FileSystemLoader(templates), { autoescape: true, throwOnUndefined: true });

function point(label, classMinutes, trainingMinutes, overrides = {}) {
    const total = classMinutes + trainingMinutes;
    return { label, rangeLabel: label, partial: false, value: total * 60, timeLabel: `${total} 分钟`, shortLabel: `${total}分`,
        classSeconds: classMinutes * 60, classLabel: `${classMinutes} 分钟`,
        trainingSeconds: trainingMinutes * 60, trainingLabel: `${trainingMinutes} 分钟`, ...overrides };
}
function render(t, trends) {
    const html = views.render('partials/training_effort_trend.html', { dashboard: { detail: { uid: 18, trends } } });
    const dom = new JSDOM(html);
    t.after(() => dom.window.close());
    return dom.window;
}

function heights(series, line) {
    const coordinates = series.querySelector(`[data-effort-line="${line}"]`).getAttribute('points').trim();
    return coordinates.split(/\s+/).map((xy) => Number(xy.split(',')[1]));
}

function checkLabels(series, readings) {
    const items = [...series.querySelectorAll('[data-effort-point][tabindex="0"]')];
    assert.equal(items.length, readings.length);
    items.forEach((item, index) => {
        const p = readings[index];
        assert.equal(item.querySelector('.effort-trend__value').textContent.trim(), p.shortLabel);
        assert.equal(item.querySelector('.effort-trend__training-value').textContent.trim(), p.trainingLabel);
        const description = item.getAttribute('title');
        assert.ok(description.includes(p.rangeLabel));
        assert.ok(description.includes(p.timeLabel));
        assert.ok(description.includes('自主训练 ' + p.trainingLabel));
        assert.equal(item.getAttribute('aria-label'), description);
    });
}

test('weeks and months switch without JavaScript; both plotted values and their date range remain accessible', (t) => {
    const weekly = [point('11/9', 0, 28), point('11/16', 8, 19, { partial: true, rangeLabel: '2026-11-16 至 2026-11-18' })];
    const monthly = [point('11月', 8, 47, { partial: true, trainingLabel: '约 47 分钟', timeLabel: '约 55 分钟', shortLabel: '约55分' })];
    const { document, getComputedStyle } = render(t, { weeks: weekly, months: monthly });
    const weeks = document.querySelector('[data-effort-series="weeks"]');
    const months = document.querySelector('[data-effort-series="months"]');
    assert.equal(getComputedStyle(weeks).display, 'block');
    assert.equal(getComputedStyle(months).display, 'none');
    checkLabels(weeks, weekly);
    checkLabels(months, monthly);
    assert.match(weeks.querySelector('.is-current').textContent, /11\/16本周至今/);
    document.querySelector('label[for="effort-trend-18-months"]').click();
    assert.ok(document.querySelector('input[aria-controls="effort-trend-18-months-plot"]').checked);
    const showSeries = [...document.styleSheets[0].cssRules].find((rule) => rule.selectorText?.includes('.effort-trend__series--months'));
    assert.equal(showSeries.style.display, 'block');
    assert.ok(months.matches(showSeries.selectorText));
    assert.ok(!weeks.matches(showSeries.selectorText));
    assert.ok(!months.querySelector('polyline'), 'a lone point has no connecting line');
    assert.ok(months.querySelector('.effort-trend__dot') && months.querySelector('.effort-trend__training-dot'));
    months.querySelector('[data-effort-point]').focus();
    assert.ok(document.activeElement.hasAttribute('data-effort-point'));
});

test('total and independent training overlap at 28 minutes without class and differ by exactly 10 minutes after class', (t) => {
    const weekly = [point('10/19', 0, 28), point('10/26', 10, 28), point('11/2', 0, 0)];
    const monthly = [point('10月', 0, 84), point('11月', 30, 84), point('12月', 0, 0)];
    const { document, getComputedStyle } = render(t, { weeks: weekly, months: monthly });
    const legends = [...document.querySelectorAll('.effort-trend__legend span')].map((span) => span.textContent.trim());
    assert.equal(legends.length, 2);
    assert.ok(legends.some((text) => text.includes('总时长')) && legends.includes('自主训练'));
    for (const [period, readings] of [['weeks', weekly], ['months', monthly]]) {
        const series = document.querySelector(`[data-effort-series="${period}"]`);
        assert.deepEqual([...series.querySelectorAll('polyline')].map((line) => line.dataset.effortLine).sort(), ['total', 'training']);
        const style = (line) => getComputedStyle(series.querySelector(`[data-effort-line="${line}"]`)).getPropertyValue('stroke-dasharray');
        assert.ok(!style('total') || style('total') === 'none', 'total time is a solid line');
        assert.match(style('training'), /[1-9]/, 'independent training is a dashed line');
        const totalLine = heights(series, 'total');
        const trainingLine = heights(series, 'training');
        const [noClass, withClass, zero] = totalLine;
        assert.ok(withClass < noClass && noClass < zero, 'adding class time raises only the total above independent training');
        assert.deepEqual(trainingLine, [noClass, noClass, zero]);
        const trainingFraction = (zero - noClass) / (zero - withClass);
        assert.ok(Math.abs(trainingFraction - 28 / 38) < 0.0001, 'both lines use the same linear duration scale');
        const markers = [...series.querySelectorAll('[data-effort-point]')];
        const markerYs = (property) => markers.map((item) => parseFloat(item.style.getPropertyValue(property)));
        assert.deepEqual(markerYs('--effort-y'), totalLine);
        assert.deepEqual(markerYs('--training-y'), trainingLine);
        checkLabels(series, readings);
    }
});

test('recorded zero periods show two zero labels, while missing history has no data points', (t) => {
    const points = Array.from({ length: 8 }, (_, i) => point(`11/${i + 1}`, 0, 0));
    const { document } = render(t, { weeks: points, months: [] });
    const weeks = document.querySelector('[data-effort-series="weeks"]');
    checkLabels(weeks, points);
    const totalYs = heights(weeks, 'total');
    assert.ok(totalYs.every((y) => Number.isFinite(y) && y === totalYs[0]));
    assert.deepEqual(heights(weeks, 'training'), totalYs);
    assert.ok(!weeks.querySelector('.effort-trend__empty'));
    assert.equal(document.querySelector('[data-effort-series="months"] .effort-trend__empty').textContent, '暂无可展示的月记录');
    const missing = render(t, undefined).document;
    assert.equal(missing.querySelectorAll('.effort-trend__empty').length, 2);
    assert.ok(!missing.querySelector('[data-effort-point]'));
});
