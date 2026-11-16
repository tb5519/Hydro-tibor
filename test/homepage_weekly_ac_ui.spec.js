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
        assert.equal(badge.textContent.trim(), '1');
        assert.equal(badge.getAttribute('aria-label'), '本周新增 AC 第 1 名');
        assert.match(badge.title, /工作区所有域.*管理员不参与排名.*并列第一/);
        assert.equal(h.value.querySelector('.homepage-personal__weekly-gap'), null);
    });

    it('shows the gap to a shared first place without changing the personal AC count', (t) => {
        const h = fixture({ eligible: true, isTop: false, gap: 8, topCount: 19, scope: 'domain' });
        t.after(h.close);
        const gap = h.value.querySelector('.homepage-personal__weekly-gap');
        assert.equal(gap.textContent.trim(), '差8题');
        assert.match(gap.getAttribute('aria-label'), /第 1 名还差 8 题/);
        assert.match(gap.title, /当前域.*追平第 1 名还需 8 题/);
        assert.equal(h.value.querySelector(':scope > strong').textContent, '11');
        assert.equal(h.value.querySelector('.homepage-personal__weekly-top'), null);
    });

    it('does not award a first-place badge when nobody has solved a problem', (t) => {
        const h = fixture({ eligible: true, isTop: true, gap: 0, topCount: 0, scope: 'workspace' }, 0);
        t.after(h.close);
        assert.equal(h.value.querySelector('.homepage-personal__weekly-note'), null);
        assert.match(h.document.querySelector('[data-growth-weekly-ac] .homepage-personal__help-panel').textContent, /本周暂无领跑学员/);
        assert.equal(h.value.querySelector('.homepage-personal__weekly-top'), null);
        assert.equal(h.value.querySelector('.homepage-personal__weekly-gap'), null);
    });

    it('shows administrators their own count while excluding them from the competition', (t) => {
        const h = fixture({ eligible: false, isTop: true, gap: 0, topCount: 11, scope: 'workspace' }, 42);
        t.after(h.close);
        assert.equal(h.value.querySelector(':scope > strong').textContent, '42');
        assert.equal(h.value.querySelector('.homepage-personal__weekly-note'), null);
        assert.match(h.document.querySelector('[data-growth-weekly-ac] .homepage-personal__help-panel').textContent, /此账户不参与学员排名/);
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
        assert.equal(board.querySelectorAll('.homepage-personal__stat').length, 3);
        assert.match(compactText(board), /本周新增 AC/);
        assert.doesNotMatch(compactText(board), /(?:7|30)\s*天新增|近\s*7\s*天/);
        assert.equal(h.value.querySelector('strong').textContent, '7');
        assert.equal(compactText(board.querySelector('[data-growth-weekly-ac] .homepage-personal__cutoff')), '周日22:00');
        assert.equal(board.querySelector('[data-growth-training-week] .homepage-personal__stat-label').textContent, '本周自主训练');
        assert.equal(board.querySelector('[data-growth-training-average] .homepage-personal__stat-label').textContent, '周均自主训练');
        assert.match(compactText(board.querySelector('[data-growth-training-week] .homepage-personal__time-value')), /2\s*小时\s*18\s*分/);
        assert.match(compactText(board.querySelector('[data-growth-training-average] .homepage-personal__time-value')), /1\s*小时\s*30\s*分/);
        assert.equal(board.querySelector('.homepage-personal__stat-hint'), null);
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

    it('distinguishes a measured zero cumulative average from missing platform recordings', (t) => {
        const zero = fixture(undefined, 0, { trainingTime: { ...trainingTime, averageWeekSeconds: 0, averageWeeks: 2 } }); t.after(zero.close);
        assert.match(compactText(zero.document.querySelector('[data-growth-training-average] .homepage-personal__time-value')), /^0\s*分钟$/);
        const method = compactText(zero.document.querySelector('[data-growth-training-average] .homepage-personal__help-panel'));
        assert.match(method, /平台开始记录以来.*累计自主训练时长除以覆盖的自然周数.*包含零训练周.*本周仍在记录中/);
        assert.doesNotMatch(method, /最近|完整周|近\s*\d+\s*个/);
        const empty = fixture(undefined, 0, { trainingTime: { ...trainingTime, averageWeekSeconds: null, averageWeeks: 0 } }); t.after(empty.close);
        assert.equal(compactText(empty.document.querySelector('[data-growth-training-average] .homepage-personal__time-value')), '—');
        assert.match(compactText(empty.document.querySelector('[data-growth-training-average]')), /尚无记录/);
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
        assert.ok(h.document.querySelector('[data-growth-training-week] .homepage-personal__help-panel').textContent.includes('不重复累计'));
        assert.ok(h.document.querySelector('[data-growth-training-average] .homepage-personal__help-panel').textContent.includes('包含零训练周'));
    });

    it('moves the live points counter into the header and removes RP and both ranking displays', (t) => {
        const h = fixture(undefined, 4, { rank: 99, rp: 400 }); t.after(h.close);
        const points = h.document.querySelector('[data-point-lottery-points]');
        assert.ok(points.closest('.section__header'));
        assert.equal(h.document.querySelectorAll('[data-point-lottery-points]').length, 1);
        assert.equal(h.document.querySelector('.homepage-personal__points > span').textContent, '积分');
        assert.equal(h.document.querySelector('.homepage-personal__identity [data-point-lottery-points]'), null);
        assert.equal(h.document.querySelector('.homepage-personal__rank'), null);
        assert.doesNotMatch(h.document.querySelector('.homepage-personal').textContent, /我的 RP|当前排名|暂无排名|排名 No\./);
    });

    it('keeps detailed methods behind three collapsed keyboard-operable native disclosure icons', (t) => {
        const h = fixture(undefined, 4, { trainingTime }); t.after(h.close);
        const helps = [...h.document.querySelectorAll('.homepage-personal__help')];
        assert.equal(helps.length, 3);
        for (const help of helps) {
            assert.equal(help.tagName, 'DETAILS'); assert.equal(help.open, false);
            assert.equal(help.firstElementChild.tagName, 'SUMMARY');
            assert.match(help.firstElementChild.getAttribute('aria-label'), /^查看.+说明$/);
            assert.equal(h.dom.window.getComputedStyle(help.querySelector('.homepage-personal__help-panel')).display, 'none');
        }
        const week = h.document.querySelector('[data-growth-training-week]');
        const average = h.document.querySelector('[data-growth-training-average]');
        assert.equal(week.getAttribute('aria-label'), '本周自主训练时长');
        assert.equal(average.getAttribute('aria-label'), '平均周自主训练时长');
        assert.equal(h.document.querySelector('.homepage-personal__week-tag'), null);
        assert.equal(h.document.querySelectorAll('.homepage-personal__stat > p').length, 0);
        assert.match(week.querySelector('.homepage-personal__help-panel').textContent, /北京时间.*周一 00:00 至下周一 00:00/);
    });
});
