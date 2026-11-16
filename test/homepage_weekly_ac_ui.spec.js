const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const template = fs.readFileSync(path.join(__dirname, '../packages/ui-default/templates/partials/homepage/personal_stats.html'), 'utf8');
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(__dirname, '../packages/ui-default/templates')), { autoescape: true });

function fixture(weeklyAc, newAc7 = 11, extra = {}) {
    const dom = new JSDOM(env.renderString(template, {
        payload: { uid: 22, newAc7, newAc30: 58, weeklyAc, ...extra },
        udict: { 22: { uname: '测试学员' } },
        user: { render_inline: () => '测试学员', render_custom_badges: () => '' },
        avatarUrl: () => '/avatar.png',
        url: () => '/mistakes',
    }));
    const value = dom.window.document.querySelector('.homepage-personal__weekly-value');
    return { dom, document: dom.window.document, value, close: () => dom.window.close() };
}

describe('homepage weekly AC comparison', () => {
    it('keeps the personal count and a first-place badge together for a positive lead, including ties', (t) => {
        const h = fixture({ eligible: true, isTop: true, gap: 0, topCount: 11, scope: 'workspace' });
        t.after(h.close);
        assert.equal(h.value.querySelector(':scope > strong').textContent, '11');
        const badge = h.value.querySelector('.homepage-personal__weekly-top');
        assert.match(badge.textContent, /TOP 1/);
        assert.equal(badge.getAttribute('aria-label'), '本周新增 AC 第 1 名');
        assert.match(badge.title, /工作区所有域.*管理员不参与排名.*并列第一/);
        assert.equal(h.value.querySelector('.homepage-personal__weekly-gap'), null);
    });

    it('shows the gap to a shared first place without changing the personal AC count', (t) => {
        const h = fixture({ eligible: true, isTop: false, gap: 8, topCount: 19, scope: 'domain' });
        t.after(h.close);
        const gap = h.value.querySelector('.homepage-personal__weekly-gap');
        assert.match(gap.textContent, /距 Top 1.*差 8 题/);
        assert.match(gap.title, /当前域.*追平第 1 名还需 8 题/);
        assert.equal(h.value.querySelector(':scope > strong').textContent, '11');
        assert.equal(h.value.querySelector('.homepage-personal__weekly-top'), null);
    });

    it('does not award a first-place badge when nobody has solved a problem', (t) => {
        const h = fixture({ eligible: true, isTop: true, gap: 0, topCount: 0, scope: 'workspace' }, 0);
        t.after(h.close);
        assert.equal(h.value.querySelector('.homepage-personal__weekly-note').textContent, '暂无领跑');
        assert.equal(h.value.querySelector('.homepage-personal__weekly-top'), null);
        assert.equal(h.value.querySelector('.homepage-personal__weekly-gap'), null);
    });

    it('shows administrators their own count while excluding them from the competition', (t) => {
        const h = fixture({ eligible: false, isTop: true, gap: 0, topCount: 11, scope: 'workspace' }, 42);
        t.after(h.close);
        assert.equal(h.value.querySelector(':scope > strong').textContent, '42');
        assert.equal(h.value.querySelector('.homepage-personal__weekly-note').textContent, '不参与排名');
        assert.equal(h.value.querySelector('.homepage-personal__weekly-top'), null);
    });

    it('renders the original count safely when comparison data is unavailable', (t) => {
        const h = fixture(undefined);
        t.after(h.close);
        assert.equal(h.value.textContent.trim(), '11');
        assert.equal(h.value.children.length, 1);
    });
});

describe('homepage natural-week growth cards', () => {
    const compactText = (element) => element.textContent.replace(/\s+/g, ' ').trim();
    const trainingTime = { thisWeekSeconds: 8280, thisWeekHasEstimate: false,
        averageWeekSeconds: 5400, averageWeekHasEstimate: false, averageWeeks: 4 };

    it('features this week AC, removes the thirty-day metric, and gives training two distinct cards', (t) => {
        const h = fixture(undefined, 91, { newAcWeek: 7, trainingTime }); t.after(h.close);
        const board = h.document.querySelector('.homepage-personal__stats');
        assert.equal(board.querySelectorAll('.homepage-personal__stat').length, 5);
        assert.match(compactText(board), /本周新增 AC/);
        assert.doesNotMatch(compactText(board), /(?:7|30)\s*天新增|近\s*7\s*天/);
        assert.equal(h.value.querySelector('strong').textContent, '7');
        assert.match(compactText(board.querySelector('[data-growth-weekly-ac]')), /周一 00:00 — 周日 22:00.*北京时间/);
        assert.match(compactText(board.querySelector('[data-growth-training-week]')), /本周自主训练时长.*2\s*小时\s*18\s*分/);
        assert.match(compactText(board.querySelector('[data-growth-training-average]')), /平均周自主训练时长.*1\s*小时\s*30\s*分.*近 4 个完整周/);
        for (const svg of board.querySelectorAll('svg')) assert.ok(svg.closest('[aria-hidden="true"]'));
    });

    it('a zero current-week count wins over an older positive legacy value', (t) => {
        const h = fixture(undefined, 123, { newAcWeek: 0 }); t.after(h.close);
        assert.equal(h.value.querySelector('strong').textContent, '0');
    });

    it('uses the same natural-week first-AC cutoff in the rank explanation and the shadow knight award', (t) => {
        const h = fixture({ eligible: true, isTop: true, topCount: 4, gap: 0, scope: 'workspace' }, 4); t.after(h.close);
        const title = h.value.querySelector('.homepage-personal__weekly-top').title;
        assert.match(title, /北京时间.*周一 00:00 至周日 22:00.*首次 AC.*重复通过不重复计数.*暗影骑士采用相同数据/);
        assert.doesNotMatch(title, /近\s*7|连续\s*7/);
    });

    for (const [seconds, expected] of [[0, /^0\s*分钟$/], [1, /^不足 1\s*分钟$/], [59, /^不足 1\s*分钟$/],
        [60, /^1\s*分钟$/], [3599, /^59\s*分钟$/], [3600, /^1\s*小时$/], [3660, /^1\s*小时\s*1\s*分$/],
        [12345 * 3600 + 23 * 60, /^12345\s*小时\s*23\s*分$/]]) {
        it(`formats ${seconds} seconds without showing fractional or invented minutes`, (t) => {
            const h = fixture(undefined, 0, { trainingTime: { ...trainingTime, thisWeekSeconds: seconds } }); t.after(h.close);
            assert.match(compactText(h.document.querySelector('[data-growth-training-week] .homepage-personal__time-value')), expected);
        });
    }

    it('marks uncertain training values with an audible approximation prefix', (t) => {
        const h = fixture(undefined, 0, { trainingTime: { ...trainingTime, thisWeekHasEstimate: true, averageWeekHasEstimate: true } }); t.after(h.close);
        for (const card of h.document.querySelectorAll('.homepage-personal__stat--time')) {
            const value = card.querySelector('.homepage-personal__time-value');
            assert.match(compactText(value), /^约\s/);
            assert.equal(value.querySelector('.homepage-personal__approx').getAttribute('aria-hidden'), null);
        }
    });

    it('rounds an estimated duration to the nearest minute consistently with the dashboard', (t) => {
        const h = fixture(undefined, 0, { trainingTime: { ...trainingTime,
            thisWeekSeconds: 7171, thisWeekHasEstimate: true } }); t.after(h.close);
        assert.match(compactText(h.document.querySelector('[data-growth-training-week] .homepage-personal__time-value')), /^约\s*2\s*小时$/);
        const zero = fixture(undefined, 0, { trainingTime: { ...trainingTime,
            thisWeekSeconds: 0, thisWeekHasEstimate: true } }); t.after(zero.close);
        assert.match(compactText(zero.document.querySelector('[data-growth-training-week] .homepage-personal__time-value')), /^0\s*分钟$/);
    });

    it('distinguishes a measured zero average from a not-yet-complete historical week', (t) => {
        const zero = fixture(undefined, 0, { trainingTime: { ...trainingTime, averageWeekSeconds: 0, averageWeeks: 2 } }); t.after(zero.close);
        assert.match(compactText(zero.document.querySelector('[data-growth-training-average]')), /0\s*分钟.*近 2 个完整周/);
        const empty = fixture(undefined, 0, { trainingTime: { ...trainingTime, averageWeekSeconds: null, averageWeeks: 0 } }); t.after(empty.close);
        assert.equal(compactText(empty.document.querySelector('[data-growth-training-average] .homepage-personal__time-value')), '—');
        assert.match(compactText(empty.document.querySelector('[data-growth-training-average]')), /暂无完整周数据/);
    });

    it('shows unavailable training as unavailable rather than a measured zero', (t) => {
        const h = fixture(undefined); t.after(h.close);
        const values = h.document.querySelectorAll('.homepage-personal__time-value');
        assert.equal(values.length, 2);
        assert.ok([...values].every((element) => compactText(element) === '—'));
    });

    it('preserves large counters and names as text', (t) => {
        const h = fixture(undefined, 0, { newAcWeek: 100000000 }); t.after(h.close);
        assert.equal(h.value.querySelector('strong').textContent, '100000000');
        assert.ok(h.document.querySelector('[data-growth-training-week]').title.includes('不重复累计'));
        assert.ok(h.document.querySelector('[data-growth-training-average]').title.includes('包含没有训练的周'));
    });
});
