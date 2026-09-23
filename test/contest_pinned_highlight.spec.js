const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const root = path.resolve(__dirname, '..');
const templates = path.join(root, 'packages/ui-default/templates');
const homepageContest = fs.readFileSync(path.join(templates, 'partials/homepage/contest.html'), 'utf8');

function renderHomepageContest(tdocs, now) {
    const env = new nunjucks.Environment(null, { autoescape: true });
    return env.renderString(homepageContest, {
        payload: [tdocs, Object.fromEntries(tdocs.map((tdoc) => [tdoc.docId, { attend: 0 }]))],
        _: (value) => value,
        url: () => '/contest',
        datetimeSpan: () => 'date',
        contest: { render_duration: () => 1 }, // eslint-disable-line ts/naming-convention
        model: {
            contest: {
                RULES: { acm: { TEXT: 'ACM' } },
                getDisplayAttend: () => 0,
                isDone: (tdoc) => tdoc.endAt <= now,
                isOngoing: () => false,
                isUpcoming: () => false,
            },
        },
    });
}

describe('expired pinned contest highlighting', () => {
    it('highlights only non-expired pinned contests while keeping both pin labels', () => {
        const now = new Date('2026-09-23T12:00:00.000Z');
        const contests = [
            {
                docId: 'active', title: 'Active pinned', rule: 'acm', pinned: true,
                beginAt: new Date(now.getTime() - 1), endAt: new Date(now.getTime() + 1),
            },
            {
                docId: 'expired', title: 'Expired pinned', rule: 'acm', pinned: true,
                beginAt: new Date(now.getTime() - 2), endAt: new Date(now),
            },
        ];

        const html = renderHomepageContest(contests, now);
        const document = new JSDOM(html).window.document;
        const rows = [...document.querySelectorAll('ol.contest__list > li.contest__item')];
        const activeRow = rows.find((row) => row.querySelector('.contest__title')?.textContent === 'Active pinned');
        const expiredRow = rows.find((row) => row.querySelector('.contest__title')?.textContent === 'Expired pinned');

        assert.ok(activeRow, 'the active pinned contest should keep the highlighted row class');
        assert.ok(expiredRow, 'the expired pinned contest should still be rendered');
        assert.ok(activeRow.classList.contains('contest__item--pinned'));
        assert.ok(activeRow.style.background.includes('linear-gradient'));
        assert.ok(!expiredRow.classList.contains('contest__item--pinned'));
        assert.equal(expiredRow.style.background, '');
        assert.equal(document.querySelectorAll('.contest-tag-pinned').length, 2, 'pin labels remain visible');
    });

    it('uses the existing isDone boundary in both contest lists without changing the pin badge', () => {
        for (const file of ['contest_main.html', 'partials/homepage/contest.html']) {
            const source = fs.readFileSync(path.join(templates, file), 'utf8');
            assert.match(source, /set highlightPinned = tdoc\.pinned and not model\.contest\.isDone\(tdoc\)/);
            assert.match(source, /if highlightPinned[^%]*%\} contest__item--pinned/);
            assert.match(source, /if highlightPinned[^%]*%\} style="background:/);
            assert.match(source, /if tdoc\.pinned[\s\S]*?contest-tag-pinned/);
        }
    });
});
