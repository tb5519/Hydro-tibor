const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const template = fs.readFileSync(path.resolve(__dirname, '../addons/badge-for-hydrooj/templates/user_badge_manage.html'), 'utf8')
    .replace('{% extends "layout/basic.html" %}', '');
const env = new nunjucks.Environment(null, { autoescape: true });

function render(cards = [], options = {}) {
    const pagination = [];
    const html = env.renderString(template, {
        badgeCards: cards,
        badgeCollection: { total: cards.length, currentName: cards.find((card) => card.isCurrent)?.title || '' },
        handler: { user: { _id: 28 } },
        page: options.page || 1,
        dpcount: options.dpcount || 1,
        url: (name, args) => (name === 'user_detail' ? `/user/${args.uid}` : `/${name}`),
        paginator: { render: (page, count) => {
            pagination.push([page, count]);
            return new nunjucks.runtime.SafeString('<nav aria-label="徽章分页">下一页</nav>');
        } },
    });
    const dom = new JSDOM(html);
    return { dom, document: dom.window.document, pagination };
}

const permanent = {
    id: 4, title: '星光探索者', short: '探索者', acImage: '/badge/4/ac.webp',
    expiresAt: null, isCurrent: false, detailUrl: '/badge/4',
};
const temporary = {
    id: 9, title: '幸运女神', short: '幸运女神', acImage: '/badge/9/ac.png',
    expiresAt: '2026-10-15T12:00:00.000Z', expiryLabel: '2026-10-15 20:00',
    isCurrent: true, detailUrl: '/badge/9',
};

describe('earned badge collection', () => {
    it('shows the actual AC art and clearly distinguishes permanent and timed awards', () => {
        const app = render([permanent, temporary]);
        try {
            const cards = [...app.document.querySelectorAll('.badge-gallery__card')];
            assert.equal(cards.length, 2);
            assert.equal(cards[0].querySelector('img').getAttribute('src'), permanent.acImage);
            assert.equal(cards[1].querySelector('img').getAttribute('src'), temporary.acImage);
            assert.equal(cards[0].querySelector('.badge-gallery__validity').textContent.trim(), '永久');
            assert.equal(cards[0].querySelector('time'), null);
            assert.equal(cards[1].querySelector('time').textContent, '2026-10-15 20:00');
            assert.equal(cards[1].querySelector('time').getAttribute('datetime'), temporary.expiresAt);
            assert.match(cards[1].querySelector('.badge-gallery__validity').textContent, /到期/);
            assert.equal(cards[1].querySelector('.badge-gallery__art').getAttribute('href'), temporary.detailUrl);
            assert.equal(app.document.querySelector('.badge-gallery__wearing-copy'), null);
        } finally { app.dom.window.close(); }
    });

    it('only displays the collection and leaves all badge switching on the owner profile', () => {
        const app = render([permanent, temporary]);
        try {
            assert.equal(app.document.querySelector('form'), null);
            assert.equal(app.document.querySelector('button'), null);
            assert.equal(app.document.querySelector('.badge-gallery__current'), null);
            assert.equal(app.document.querySelector('.badge-gallery__back').getAttribute('href'), '/user/28');
        } finally { app.dom.window.close(); }
    });

    it('keeps image-less awards usable without broken images and escapes badge text', () => {
        const app = render([{ ...permanent, acImage: '', title: '<script>unsafe()</script>', short: '<img src=x>' }]);
        try {
            const card = app.document.querySelector('.badge-gallery__card');
            assert.equal(card.querySelector('img'), null);
            assert.equal(card.querySelector('script'), null);
            assert.equal(card.querySelector('.badge-gallery__short').textContent, '<img src=x>');
            assert.equal(card.querySelector('h2').textContent, '<script>unsafe()</script>');
            assert.equal(card.querySelector('button'), null);
        } finally { app.dom.window.close(); }
    });

    it('gives empty collections a calm helpful state and a route back to the owner profile', () => {
        const app = render();
        try {
            assert.equal(app.document.querySelectorAll('.badge-gallery__card').length, 0);
            assert.ok(app.document.querySelector('.badge-gallery__empty h2'));
            assert.equal(app.document.querySelector('.badge-gallery__count').textContent, '0 枚收藏');
            assert.equal(app.document.querySelector('.badge-gallery__back').getAttribute('href'), '/user/28');
            assert.equal(app.document.querySelector('form'), null);
        } finally { app.dom.window.close(); }
    });

    it('keeps server pagination available for a larger earned collection', () => {
        const app = render([permanent], { page: 2, dpcount: 3 });
        try {
            assert.deepEqual(app.pagination, [[2, 3]]);
            assert.ok(app.document.querySelector('nav[aria-label="徽章分页"]'));
        } finally { app.dom.window.close(); }
    });
});
