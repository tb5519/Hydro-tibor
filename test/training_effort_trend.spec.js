const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const templates = path.resolve(__dirname, '../packages/ui-default/templates');
const views = new nunjucks.Environment(new nunjucks.FileSystemLoader(templates), { autoescape: true, throwOnUndefined: true });

function point(label, value, shortLabel, partial = false) {
    return { label, value, shortLabel, partial, rangeLabel: '2026/11/16 – 2026/11/18', timeLabel: shortLabel,
        trainingLabel: '3 小时', classLabel: '2 小时' };
}
function render(t, trends) {
    const html = views.render('partials/training_effort_trend.html', { dashboard: { detail: { uid: 18, trends } } });
    const dom = new JSDOM(html);
    t.after(() => dom.window.close());
    return dom.window;
}

test('switches between rendered weeks and months without JavaScript and exposes each confirmed duration', (t) => {
    const { document, getComputedStyle } = render(t, {
        weeks: [point('11/9', 18000, '5时'), point('11/16', 7200, '2时', true)],
        months: [point('11月', 25200, '约7时', true)],
    });
    const weeks = document.querySelector('[data-effort-series="weeks"]');
    const months = document.querySelector('[data-effort-series="months"]');
    assert.equal(getComputedStyle(weeks).display, 'block');
    assert.equal(getComputedStyle(months).display, 'none');
    const pointHeights = weeks.querySelector('polyline').getAttribute('points').trim().split(/\s+/).map((xy) => Number(xy.split(',')[1]));
    assert.ok(pointHeights[0] < pointHeights[1], 'the larger value must be higher on screen');
    assert.equal(weeks.querySelectorAll('[data-effort-point][tabindex="0"]').length, 2);
    assert.match(weeks.querySelector('.is-current').textContent, /11\/16本周至今/);
    const description = weeks.querySelector('.is-current').getAttribute('title');
    assert.match(description, /2026\/11\/16.*自主训练 3 小时.*上课 2 小时/);
    assert.equal(weeks.querySelector('.is-current').getAttribute('aria-label'), description);
    document.querySelector('label[for="effort-trend-18-months"]').click();
    assert.ok(document.querySelector('input[aria-controls="effort-trend-18-months-plot"]').checked);
    const showSeries = [...document.styleSheets[0].cssRules].find((rule) => rule.selectorText?.includes('.effort-trend__series--months'));
    assert.equal(showSeries.style.display, 'block');
    assert.ok(months.matches(showSeries.selectorText));
    assert.ok(!weeks.matches(showSeries.selectorText));
    assert.ok(!months.querySelector('polyline'), 'a lone point has no connecting line');
    months.querySelector('[data-effort-point]').focus();
    assert.ok(document.activeElement.hasAttribute('data-effort-point'));
    assert.match(months.textContent, /约7时/);
});

test('renders every dense or zero-valued period and distinguishes missing history from measured zeroes', (t) => {
    const points = Array.from({ length: 8 }, (_, i) => point(`11/${i + 1}`, 0, '0分', i === 7));
    const { document } = render(t, { weeks: points, months: [] });
    const weeks = document.querySelector('[data-effort-series="weeks"]');
    assert.deepEqual([...weeks.querySelectorAll('.effort-trend__value')].map((el) => el.textContent), points.map((p) => p.shortLabel));
    assert.equal(weeks.querySelectorAll('.effort-trend__period').length, 8);
    assert.ok(weeks.querySelector('polyline').getAttribute('points').trim().split(/\s+/).every((xy) => xy.endsWith(',126')));
    assert.ok(!weeks.querySelector('.effort-trend__empty'));
    assert.equal(document.querySelector('[data-effort-series="months"] .effort-trend__empty').textContent, '暂无可展示的月记录');
    const missing = render(t, undefined).document;
    assert.equal(missing.querySelectorAll('.effort-trend__empty').length, 2);
    assert.ok(!missing.querySelector('[data-effort-point]'));
});
