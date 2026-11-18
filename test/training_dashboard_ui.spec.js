const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const { fixture, studentDetail, render } = require('./fixtures/training_dashboard');

function page(t, data = fixture(), width, savedTrend) {
    const dom = new JSDOM(render(data), {
        url: 'https://onebyone.test/d/python/manage/training-dashboard', runScripts: 'dangerously',
        beforeParse(window) {
            if (savedTrend) window.sessionStorage.setItem('onebyone:training-dashboard:trend', savedTrend);
            if (width) window.Element.prototype.getBoundingClientRect = () => ({ width });
        },
    });
    t.after(() => dom.window.close());
    return dom.window;
}

test('the roster links to individual learners and the selected learner owns the period cards, trend and problems', (t) => {
    const data = fixture();
    const { document } = page(t, data);
    const roster = document.querySelector('#training-roster');
    const links = [...roster.querySelectorAll('[data-training-student-link]')];
    assert.deepEqual(links.map(a => new URL(a.href).searchParams.get('student')), data.rows.map(r => String(r.uid)));
    assert.equal(links.filter(a => a.getAttribute('aria-current') === 'page').length, 1);
    assert.match(links.find(a => a.getAttribute('aria-current') === 'page').textContent, /方全然/);
    assert.match(document.querySelector('h1').textContent, /学员训练看板/);
    assert.equal(document.querySelector('[data-heading-student]').textContent.trim(), data.detail.name);
    assert.equal(document.querySelectorAll('[data-study-period]').length, 2);
    for (const [key, values] of Object.entries(data.detail.periods)) {
        const card = document.querySelector(`[data-study-period=${key}]`);
        assert.ok(card.textContent.includes(values.dateLabel), `date range for ${key}`);
        assert.equal(card.querySelector('[data-time=total]').textContent.trim(), values.timeLabel);
        assert.equal(card.querySelector('[data-time=independent]').textContent.trim(), values.trainingLabel);
        assert.equal(card.querySelector('[data-time=class]').textContent.trim(), values.classLabel);
    }
    assert(document.querySelector('[data-effort-trend]'));
    assert(document.querySelector('#training-problems'));
    const next = [...roster.querySelectorAll('.tdash-pagination a')].find(a => new URL(a.href).searchParams.get('page') === '2');
    assert(next);
    assert.equal(new URL(next.href).searchParams.has('student'), false, 'the next roster page can select its own learner');
    assert.equal(document.querySelector('.tdash-stats'), null);
});

test('the monthly view stays selected when moving between learners in this tab', (t) => {
    const first = page(t);
    const key = 'onebyone:training-dashboard:trend';
    first.document.querySelector('.effort-trend__radio--months').click();
    const second = page(t, fixture({ detail: studentDetail({ uid: 13 }) }), 900, first.sessionStorage.getItem(key));
    assert.equal(second.document.querySelector('.effort-trend__radio--months').checked, true);
    second.document.querySelector('.effort-trend__radio--weeks').click();
    assert.equal(second.sessionStorage.getItem(key), 'weeks');
});

test('learner search keeps the classroom scope and drops the previous selection and page', (t) => {
    const { document, FormData } = page(t, fixture({ q: '秦', currentQuery: { page: '3', student: '13', domains: 'python' } }));
    const form = document.querySelector('.tdash-search');
    assert.equal(form.method, 'get');
    const search = new FormData(form);
    assert.equal(search.get('q'), '秦');
    assert.deepEqual(search.getAll('domains'), ['python']);
    assert.equal(search.has('student'), false);
    assert.equal(search.has('page'), false);
});

test('a domain selection can combine classrooms, reset a previous learner and return safely to all classrooms', (t) => {
    const { document, Event, FormData } = page(t, fixture({ allDomains: true }));
    const form = document.querySelector('#training-dashboard-filters');
    const all = form.querySelector('[data-training-domain-all]');
    const picks = [...form.querySelectorAll('[data-training-domain]')];
    assert.equal(all.checked, true);
    for (const input of picks) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    assert.equal(all.checked, false);
    assert.deepEqual(new FormData(form).getAll('domains'), ['python', 'cpp']);
    assert.equal(new FormData(form).has('student'), false);
    all.checked = true;
    all.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(new FormData(form).getAll('domains'), ['all']);
    all.checked = false;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.equal(all.checked, true);
});

test('problem-period links retain learner and classroom, and problem links lead to their own classrooms', (t) => {
    const data = fixture();
    const { document } = page(t, data);
    const section = document.querySelector('#training-problems');
    const periods = [...section.querySelectorAll('[data-problem-period]')];
    assert.deepEqual(periods.map(a => new URL(a.href).searchParams.get('period')), ['7d', 'thisWeek']);
    assert.equal(periods[0].getAttribute('aria-current'), 'page');
    for (const a of periods) {
        const params = new URL(a.href).searchParams;
        assert.equal(params.get('student'), String(data.detail.uid));
        assert.equal(params.get('domains'), 'python,cpp');
    }
    const rows = [...section.querySelectorAll('tbody tr[data-training-problem]')];
    assert.equal(rows.length, data.detail.problems.length);
    for (const [index, row] of rows.entries()) {
        const problem = data.detail.problems[index];
        const anchor = row.querySelector('a');
        assert.match(row.textContent, new RegExp(problem.title));
        if (problem.url) {
            assert.equal(new URL(anchor.href).pathname, problem.url);
            const displayId = row.querySelector('.tdash-problem-name small').textContent.trim().split(/\s*·\s*/)[0];
            assert.equal(displayId, String(problem.pid), 'display the real problem ID as stored');
        } else assert.equal(anchor, null, 'a question the teacher cannot open has no title link');
        assert.match(row.querySelector('[data-problem-time]').textContent, new RegExp(problem.timeLabel));
        assert.match(row.querySelector('[data-problem-submits]').textContent, new RegExp(String(problem.submits)));
    }
    const bars = rows.map(row => parseFloat(row.querySelector('.tdash-bar i').style.width));
    assert.ok(bars[0] > bars[1] && bars[1] > bars[2] && bars[2] > 0, 'the duration bars reflect actual relative time');
    assert.match(rows[0].querySelector('[data-problem-result]').textContent, /未通过/);
    assert.match(rows[1].querySelector('[data-problem-result]').textContent, /(?:已通过|AC)/);
});

test('weekly and monthly trends expose each learner-specific period, including zero, to keyboard and pointer users', (t) => {
    const data = fixture();
    const { document } = page(t, data);
    const chart = document.querySelector('[data-effort-trend]');
    const radios = [...chart.querySelectorAll('input[type=radio]')];
    assert.equal(radios.length, 2);
    assert.equal(radios.filter(input => input.checked).length, 1);
    radios.find(input => !input.checked).click();
    assert.equal(radios.filter(input => input.checked).length, 1);
    for (const [kind, expected] of Object.entries(data.detail.trends)) {
        const series = chart.querySelector(`[data-effort-series=${kind}]`);
        const points = [...series.querySelectorAll('[data-effort-point]')];
        assert.equal(points.length, expected.length, kind);
        for (const [i, p] of points.entries()) {
            const source = expected[i];
            assert.equal(p.tabIndex, 0);
            assert.equal(p.querySelector('.effort-trend__value').textContent.trim(), source.shortLabel);
            const accessible = p.getAttribute('aria-label') || '';
            for (const label of [source.rangeLabel, source.timeLabel, source.trainingLabel, source.classLabel]) {
                assert.ok(accessible.includes(label), `${kind}[${i}] accessible label lacks ${label}: ${accessible}`);
            }
        }
    }
});

test('a learner without activity sees zero measurements and an empty problem list while an unmatched search has no learner panel', (t) => {
    const zero = { dateLabel: '11/16—11/18', seconds: 0, timeLabel: '0 分钟', trainingSeconds: 0, trainingLabel: '0 分钟', classSeconds: 0, classLabel: '0 分钟', hasEstimate: false };
    const data = fixture({ detail: studentDetail({ periods: { week: zero, recent: zero }, problems: [], trends: { weeks: [], months: [] } }) });
    const { document } = page(t, data);
    assert.equal(document.querySelectorAll('[data-study-period] [data-time]').length, 6);
    for (const item of document.querySelectorAll('[data-study-period] [data-time]')) assert.match(item.textContent, /0\s*分钟/);
    assert(document.querySelector('[data-empty-problems]'));
    assert.equal(document.querySelectorAll('tr[data-training-problem]').length, 0);
    const empty = page(t, fixture({ q: '无此学生', rows: [], detail: null, pagination: { total: 0, page: 1, pageCount: 1, prevUrl: '', nextUrl: '' } })).document;
    assert(empty.querySelector('[data-empty-roster]'));
    assert.equal(empty.querySelector('[data-study-period]'), null);
    assert.equal(empty.querySelector('[data-effort-trend]'), null);
    assert.equal(empty.querySelector('.tdash-pagination a'), null);
});

test('a narrow viewport prioritizes the selected learner and keeps the roster available when a search finds no learner', (t) => {
    const narrow = page(t, fixture(), 375).document;
    const picker = narrow.querySelector('#training-roster');
    assert.equal(picker.open, false);
    picker.querySelector('summary').click();
    assert.equal(picker.open, true);
    assert(narrow.querySelector('[data-training-student-link]'));
    const missing = page(t, fixture({ q: '无人匹配', rows: [], detail: null }), 375).document;
    assert.equal(missing.querySelector('#training-roster').open, true);
    const wide = page(t, fixture(), 1000).document;
    assert.equal(wide.querySelector('#training-roster').open, true);
});

test('historical estimates stay marked in the cards and question list and unattributed practice remains separate', (t) => {
    const data = fixture();
    Object.assign(data.detail.periods.recent, { hasEstimate: true, trainingLabel: '约 6 分钟', timeLabel: '约 36 分钟' });
    Object.assign(data.detail.problems[0], { hasEstimate: true, timeLabel: '约 6 分钟' });
    data.detail.otherPracticeLabel = '约 2 分钟';
    const { document } = page(t, data);
    const recent = document.querySelector('[data-study-period=recent]');
    assert.equal(recent.querySelector('[data-time=independent]').textContent.trim(), '约 6 分钟');
    assert.equal(recent.querySelector('[data-time=total]').textContent.trim(), '约 36 分钟');
    assert.equal(document.querySelector('[data-problem-time]').textContent.trim(), '约 6 分钟');
    assert.match(document.querySelector('#training-problems').textContent, /其他练习\s*约 2 分钟/);
});

test('learner names, usernames, question titles and searches remain escaped', (t) => {
    const unsafe = '<img src=x onerror=alert(1)>';
    const detail = studentDetail({ name: unsafe });
    detail.problems[0].title = unsafe;
    const data = fixture({ detail, q: '"><script>alert(1)</script>' });
    data.rows[0].name = unsafe;
    data.rows[0].uname = unsafe;
    const { document } = page(t, data);
    assert.equal(document.querySelectorAll('[onerror]').length, 0);
    assert.equal(document.querySelector('.tdash-search [name=q]').value, data.q);
    assert.equal(document.querySelector('[data-heading-student]').textContent.trim(), unsafe);
    assert.ok(document.querySelector('tr[data-training-problem]').textContent.includes(unsafe));
    assert.ok(document.querySelector('[data-training-student-link]').textContent.includes(unsafe));
});

test('sync settings stay folded until requested and a just-issued token can be read and copied without entering any URL', async (t) => {
    const data = fixture();
    const normal = page(t, data);
    assert.equal(normal.document.querySelector('[data-class-integration]').open, false);
    assert.equal(normal.document.querySelector('#training-class-token'), null);
    normal.document.querySelector('[data-class-integration] > summary').click();
    assert.equal(normal.document.querySelector('[data-class-integration]').open, true);
    data.integration.token = 'one-use-<value>';
    const { document, navigator, FormData } = page(t, data);
    assert.equal(document.querySelector('[data-class-integration]').open, true);
    const token = document.querySelector('#training-class-token');
    assert.ok(token.closest('[data-live-share-private]'));
    assert.equal(token.readOnly, true);
    assert.equal(token.value, data.integration.token);
    let copied;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async v => { copied = v; } } });
    document.querySelector('[data-copy-class-token]').click();
    await Promise.resolve();
    assert.equal(copied, data.integration.token);
    const issue = document.querySelector('[data-class-token-form]');
    assert.equal(issue.method, 'post');
    assert.equal(new FormData(issue).get('operation'), 'issueClassToken');
    assert.deepEqual(new FormData(issue).getAll('domains'), ['python', 'cpp']);
    const revoke = [...document.querySelectorAll('form[method=post]')].find(form => new FormData(form).get('operation') === 'revokeClassToken');
    assert(revoke);
    for (const form of document.querySelectorAll('form')) {
        assert(!form.action.includes(data.integration.token));
        assert.equal(new FormData(form).has('token'), false);
    }
});

test('token generation requires a selected classroom and accepts a valid choice after correction', (t) => {
    const { document, Event } = page(t);
    const form = document.querySelector('[data-class-token-form]');
    const domains = [...form.querySelectorAll('[name=domains]')];
    for (const input of domains) input.checked = false;
    assert.equal(form.dispatchEvent(new Event('submit', { cancelable: true })), false);
    assert.match(domains[0].validationMessage, /课堂/);
    domains[1].checked = true;
    domains[1].dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(form.dispatchEvent(new Event('submit', { cancelable: true })), true);
    assert.equal(domains[0].validationMessage, '');
});
