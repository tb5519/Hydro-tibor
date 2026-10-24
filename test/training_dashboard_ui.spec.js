const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const { fixture, studentDetail, render } = require('./fixtures/training_dashboard');

function page(t, overrides = {}) {
    const dom = new JSDOM(render(fixture(overrides)), { url: 'https://onebyone.test/manage/training-dashboard', runScripts: 'dangerously' });
    t.after(() => dom.window.close());
    return dom;
}

test('teacher dashboard provides coherent summaries and server-paged roster without a public ranking', (t) => {
    const { document } = page(t).window;
    assert.match(document.querySelector('h1').textContent, /学员训练看板/);
    assert.equal(document.querySelectorAll('.tdash-stat').length, 4);
    assert.match(document.querySelector('.tdash-private').textContent, /仅教师可见/);
    assert.match(document.querySelector('.tdash-stat--time').textContent, /24 小时 50 分/);
    assert.equal(document.querySelectorAll('.tdash-table--roster tbody tr').length, 6);
    assert.match(document.querySelector('.tdash-roster__foot').textContent, /共 24 名学员/);
    assert.equal(new URL(document.querySelector('.tdash-pagination a').href).searchParams.get('page'), '2');
    assert.ok(!document.querySelector('[data-training-dashboard]').textContent.includes('进步最快'));
    assert.equal(document.querySelector('.tdash-periods [aria-current=page]').textContent, '近 7 天');
});

test('domain checkbox picker supports multiple scopes, mutual exclusivity and safe empty fallback', (t) => {
    const dom = page(t, { allDomains: true });
    const { document, Event, FormData } = dom.window;
    const form = document.querySelector('#training-dashboard-filters');
    const all = form.querySelector('[data-training-domain-all]');
    const picks = [...form.querySelectorAll('[data-training-domain]')];
    assert.ok(all.checked);
    picks[0].checked = true;
    picks[0].dispatchEvent(new Event('change'));
    assert.equal(all.checked, false);
    picks[1].checked = true;
    picks[1].dispatchEvent(new Event('change'));
    assert.deepEqual(new FormData(form).getAll('domains'), ['python', 'cpp']);
    all.checked = true;
    all.dispatchEvent(new Event('change'));
    assert.deepEqual(new FormData(form).getAll('domains'), ['all']);
    all.checked = false;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.equal(all.checked, true);
});

test('search and sort retain date and domain filters while resetting stale pagination', (t) => {
    const currentQuery = { domains: 'python,cpp', period: 'custom', start: '2026-10-01', end: '2026-10-24', page: '3', student: '12', q: '小禾', sort: 'time', attention: 'stuck' };
    const { document, FormData } = page(t, { currentQuery }).window;
    const search = new FormData(document.querySelector('.tdash-search'));
    assert.equal(search.get('domains'), 'python,cpp');
    assert.equal(search.get('start'), '2026-10-01');
    assert.equal(search.has('page'), false);
    assert.equal(search.has('student'), false);
    const sort = new FormData(document.querySelector('.tdash-sort'));
    assert.equal(sort.get('domains'), 'python,cpp');
    assert.equal(sort.get('q'), '小禾');
    assert.equal(sort.has('page'), false);
});

test('custom date selection validates chronology and the inclusive 90-day range', (t) => {
    const dom = page(t);
    const { document, Event } = dom.window;
    const form = document.querySelector('#training-dashboard-filters');
    const custom = form.querySelector('[data-training-custom]');
    custom.click();
    assert.equal(document.querySelector('#training-dashboard-dates').hidden, false);
    assert.equal(custom.getAttribute('aria-expanded'), 'true');
    form.querySelector('[name=period]').value = 'custom';
    const start = form.querySelector('[name=start]');
    const end = form.querySelector('[name=end]');
    start.value = '2026-10-24'; end.value = '2026-10-23';
    let event = new Event('submit', { cancelable: true });
    form.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.match(end.validationMessage, /早于/);
    start.value = '2026-01-01'; end.value = '2026-04-01';
    event = new Event('submit', { cancelable: true }); form.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.match(end.validationMessage, /90 天/);
    end.value = '2026-03-31'; end.dispatchEvent(new Event('input'));
    event = new Event('submit', { cancelable: true }); form.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
});

test('selected learner shows cross-period duration, classroom breakdown and effort before AC', (t) => {
    const { document } = page(t, { detail: studentDetail() }).window;
    const panel = document.querySelector('#training-student');
    assert.equal(panel.querySelector('h2').textContent, '方全然');
    assert.equal(panel.querySelectorAll('.tdash-student__stats>div').length, 4);
    assert.match(panel.textContent, /平均每周/);
    assert.equal(panel.querySelectorAll('.tdash-domain-stat').length, 2);
    const rows = [...panel.querySelectorAll('.tdash-problem-table tbody tr')];
    assert.equal(rows.length, 3);
    assert.match(rows[0].textContent, /数字替换.*1 小时 15 分.*4.*未通过/s);
    assert.match(rows[1].textContent, /已通过/);
    assert.equal(rows[2].querySelector('a'), null);
    assert.match(rows[2].textContent, /每日一练.*练习记录/s);
    assert.equal(document.querySelectorAll('.tdash-table--roster tr.is-selected').length, 1);
});

test('empty measured time is presented as missing data without judging the learner', (t) => {
    const { document } = page(t, { summary: { seconds: 0, timeLabel: '暂无记录', activeStudents: 0, studentCount: 0, acceptedProblems: 0, submits: 0 }, rows: [], pagination: { total: 0, page: 1, pageCount: 1, prevUrl: '', nextUrl: '' } }).window;
    assert.match(document.querySelector('.tdash-empty-note').textContent, /上线后/);
    assert.match(document.querySelector('.tdash-method').textContent, /不代表没有学习/);
    assert.match(document.querySelector('.tdash-empty').textContent, /还没有学员/);
    assert.equal(document.querySelectorAll('.tdash-pagination a').length, 0);
});

test('names, search terms and problem titles are escaped in labels, input values and details', (t) => {
    const unsafe = '<img src=x onerror=alert(1)>';
    const data = fixture();
    data.rows[0].name = unsafe;
    data.q = '\"><script>alert(1)</script>';
    data.detail = studentDetail({ name: unsafe, problems: [{ domainName: unsafe, pid: 'P1', title: unsafe, url: '/d/python/p/P1', seconds: 50, timeLabel: '不足 1 分钟', accepted: false, submits: 0 }] });
    const dom = new JSDOM(render(data)); t.after(() => dom.window.close());
    const document = dom.window.document;
    assert.equal(document.querySelectorAll('[onerror]').length, 0);
    assert.equal(document.querySelectorAll('script').length, 1);
    assert.equal(document.querySelector('.tdash-search input[name=q]').value, data.q);
    assert.equal(document.querySelector('#training-student-title').textContent, unsafe);
    assert.equal(document.querySelector('.tdash-problem-title').textContent, `P1 · ${unsafe}`);
});

test('changing domain scope clears selected student while date and sort controls preserve it', (t) => {
    const { document, FormData, Event } = page(t, { detail: studentDetail() }).window;
    const form = document.querySelector('#training-dashboard-filters');
    assert.equal(new FormData(form).get('student'), '12');
    assert.equal(new FormData(document.querySelector('.tdash-sort')).get('student'), '12');
    const end = form.querySelector('[name=end]');
    end.dispatchEvent(new Event('input'));
    assert.equal(new FormData(form).get('student'), '12');
    assert.equal(new FormData(form).get('period'), 'custom');
    form.querySelector('[data-training-domain]').dispatchEvent(new Event('change'));
    assert.equal(new FormData(form).has('student'), false);
});

test('90-day charts preserve every day and reduce axis labels without dropping last date', (t) => {
    const daily = Array.from({ length: 90 }, (_, index) => ({ date: `day-${index}`, label: String(index + 1), seconds: index * 60, timeLabel: `${index} 分钟`, barPercent: index }));
    const { document } = page(t, { daily }).window;
    const chart = document.querySelector('.tdash-trend');
    assert.ok(chart.classList.contains('is-dense'));
    assert.equal(chart.querySelectorAll('[tabindex="0"]').length, 90);
    const labels = [...chart.querySelectorAll('.tdash-trend__date:not(.is-quiet)')].map((item) => item.textContent);
    assert.equal(labels[0], '1');
    assert.equal(labels.at(-1), '90');
    assert.ok(labels.length <= 8);
});
