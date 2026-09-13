const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const template = fs.readFileSync(path.join(__dirname, '../packages/ui-default/templates/partials/homepage/personal_stats.html'), 'utf8');
const env = new nunjucks.Environment(null, { autoescape: true });

function fixture(weeklyAc, newAc7 = 11) {
    const dom = new JSDOM(env.renderString(template, {
        payload: { uid: 22, newAc7, newAc30: 58, weeklyAc },
        udict: { 22: { uname: '测试学员' } },
        user: { render_inline: () => '测试学员', render_custom_badges: () => '' },
        avatarUrl: () => '/avatar.png',
        url: () => '/mistakes',
    }));
    const value = dom.window.document.querySelector('.homepage-personal__weekly-value');
    return { dom, value, close: () => dom.window.close() };
}

describe('homepage weekly AC comparison', () => {
    it('keeps the personal count and a first-place badge together for a positive lead, including ties', (t) => {
        const h = fixture({ eligible: true, isTop: true, gap: 0, topCount: 11, scope: 'workspace' });
        t.after(h.close);
        assert.equal(h.value.querySelector(':scope > strong').textContent, '11');
        const badge = h.value.querySelector('.homepage-personal__weekly-top');
        assert.match(badge.textContent, /TOP 1/);
        assert.equal(badge.getAttribute('aria-label'), '近 7 天 AC 第 1 名');
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
