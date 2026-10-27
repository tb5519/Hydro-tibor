const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(__dirname, '../packages/ui-default/templates')), { autoescape: true });

function render({ count = 3, total = 14, member = true, artwork = true } = {}) {
    const items = Array.from({ length: count }, (_, i) => ({
        id: `award-${i}`, name: `成就 ${i + 1}`, description: `达成要求 ${i + 1}`,
        thumbnailUrl: artwork ? `https://objects.test/thumb-${i}.webp` : '',
        imageUrl: `https://objects.test/original-${i}.png`,
    }));
    return new JSDOM(env.render('partials/homepage/personal_stats.html', {
        payload: member ? { uid: 19, rp: 0, newAc7: 3, newAc30: 124, acDifficulty: { total: 1328, highestLevel: 8, levels: [] } } : null,
        udict: member ? { 19: { _id: 19, uname: 'Owen' } } : {},
        user: { render_inline: () => 'Owen', render_custom_badges: () => '' },
        avatarUrl: () => '/avatar.png', pointLottery: { points: 0 },
        achievementWall: { items, total, unlocked: count },
    }));
}

describe('homepage achievement wall', () => {
    it('places the highest earned achievement from each series between personal statistics and AC difficulty using only thumbnails', (t) => {
        const dom = render({ count: 14 }); t.after(() => dom.window.close());
        const document = dom.window.document;
        const wall = document.querySelector('[data-achievement-wall]');
        assert.equal(wall.previousElementSibling.className, 'homepage-personal__stats');
        assert.equal(wall.nextElementSibling.className, 'profile-ac-difficulty');
        assert.equal(wall.querySelectorAll('[data-achievement-tile]').length, 14);
        assert.equal(wall.querySelector('[data-achievement-count]').textContent, '0');
        assert.match(wall.querySelector('.achievement-wall__count').textContent, /\/ 14/);
        assert.equal(wall.querySelector('.achievement-wall__count').getAttribute('aria-label'), '已点亮 14 / 14 个成就系列');
        assert.equal(wall.querySelectorAll('[data-achievement-pending]').length, 14);
        assert.equal(wall.querySelector('.achievement-wall__count small').textContent, '系列');
        assert.equal(wall.querySelector('[data-achievement-count-label]').dataset.achievementTotal, '14');
        assert.match(wall.querySelector('.achievement-wall__tooltip-eyebrow').textContent, /本系列最高成就/);
        assert.equal(wall.querySelector('header').hidden, false);
        assert.match(wall.querySelector('.achievement-wall__intro').textContent, /每个系列.*最高成就/);
        for (const img of wall.querySelectorAll('img')) {
            assert.match(img.src, /\/thumb-\d+\.webp$/);
            assert.equal(img.getAttribute('loading'), 'eager');
        }
        assert.equal(wall.hasAttribute('data-achievement-wall-loading'), false);
        assert.ok(wall.querySelector('[data-achievement-grid-empty]'));
        assert.equal(document.querySelector('[src*="original-"]'), null);
    });

    it('addresses the homepage owner directly and never substitutes stars for missing achievement artwork', (t) => {
        const empty = render({ count: 0 }); t.after(() => empty.window.close());
        assert.match(empty.window.document.querySelector('.achievement-wall__empty').textContent, /属于你的成就之旅/);
        const noArtwork = render({ artwork: false }); t.after(() => noArtwork.window.close());
        const wall = noArtwork.window.document.querySelector('[data-achievement-wall]');
        assert.equal(wall.querySelectorAll('img').length, 0);
        assert.equal(wall.querySelector('.achievement-wall__fallback-name'), null);
        assert.equal(wall.querySelector('.achievement-wall__placeholder'), null);
        assert.equal(wall.querySelectorAll('[data-achievement-pending]').length, 3);
        assert.equal(wall.querySelectorAll('[data-achievement-tile][hidden]').length, 3);
        assert.equal(wall.querySelector('[data-achievement-count]').textContent, '0');
    });

    it('takes its denominator from the server and uses zero when the catalogue total is unavailable', (t) => {
        for (const total of [14, 15, 0, null]) {
            const dom = render({ count: 0, total }); t.after(() => dom.window.close());
            const count = dom.window.document.querySelector('.achievement-wall__count');
            assert.match(count.textContent, new RegExp(`/ ${total || 0} 系列$`));
            assert.equal(count.getAttribute('aria-label'), `已点亮 0 / ${total || 0} 个成就系列`);
        }
    });

    it('does not show a personal wall when there is no signed-in personal card', (t) => {
        const dom = render({ member: false }); t.after(() => dom.window.close());
        assert.equal(dom.window.document.querySelector('[data-achievement-wall]'), null);
    });
});
