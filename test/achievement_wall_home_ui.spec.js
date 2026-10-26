const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(__dirname, '../packages/ui-default/templates')), { autoescape: true });

function render({ count = 3, member = true, artwork = true } = {}) {
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
        achievementWall: { items, total: 50, unlocked: count },
    }));
}

describe('homepage achievement wall', () => {
    it('places the complete earned collection between personal statistics and AC difficulty using only thumbnails', (t) => {
        const dom = render({ count: 50 }); t.after(() => dom.window.close());
        const document = dom.window.document;
        const wall = document.querySelector('[data-achievement-wall]');
        assert.equal(wall.previousElementSibling.className, 'homepage-personal__stats');
        assert.equal(wall.nextElementSibling.className, 'profile-ac-difficulty');
        assert.equal(wall.querySelectorAll('[data-achievement-tile]').length, 50);
        assert.equal(wall.querySelector('.achievement-wall__count strong').textContent, '50');
        for (const img of wall.querySelectorAll('img')) {
            assert.match(img.src, /\/thumb-\d+\.webp$/);
            assert.equal(img.getAttribute('loading'), 'eager');
        }
        assert.equal(wall.hasAttribute('data-achievement-wall-loading'), true);
        assert.equal(document.querySelector('[src*="original-"]'), null);
    });

    it('addresses the homepage owner directly and keeps image-less achievements available', (t) => {
        const empty = render({ count: 0 }); t.after(() => empty.window.close());
        assert.match(empty.window.document.querySelector('.achievement-wall__empty').textContent, /属于你的成就之旅/);
        const noArtwork = render({ artwork: false }); t.after(() => noArtwork.window.close());
        const wall = noArtwork.window.document.querySelector('[data-achievement-wall]');
        assert.equal(wall.querySelectorAll('img').length, 0);
        assert.equal(wall.querySelectorAll('.achievement-wall__fallback-name').length, 3);
    });

    it('does not show a personal wall when there is no signed-in personal card', (t) => {
        const dom = render({ member: false }); t.after(() => dom.window.close());
        assert.equal(dom.window.document.querySelector('[data-achievement-wall]'), null);
    });
});
