const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

// Render the complete Scratch page content, dialogs and styles without the OJ
// layout's unrelated runtime globals. All community templates remain real files.
class ScratchLayoutLoader extends nunjucks.Loader {
    getSource(name) {
        if (name !== 'scratch_base.html') return null;
        return { src: '<!doctype html><html><body>{% include "partials/scratch_style.html" %}'
            + '<main class="scratch-app">{% block scratch_content %}{% endblock %}'
            + '{% include "partials/scratch_dialogs.html" %}</main></body></html>', path: name, noCache: true };
    }
}
const templateRoot = path.resolve(__dirname, '../packages/ui-default/templates');
const env = new nunjucks.Environment([new ScratchLayoutLoader(), new nunjucks.FileSystemLoader(templateRoot)], { autoescape: true });
env.addFilter('json', JSON.stringify);
const routes = {
    scratch_community: '/d/art/scratch/community',
    scratch_works: '/d/art/scratch/works',
    scratch_community_work: ({ communityId }) => `/d/art/scratch/community/${communityId}`,
    scratch_community_metrics: ({ communityId }) => `/d/art/scratch/community/${communityId}/metrics`,
    scratch_community_analytics: ({ communityId }) => `/d/art/scratch/community/${communityId}/analytics`,
    scratch_community_thumbnail: ({ communityId }) => `/d/art/scratch/community/${communityId}/thumbnail`,
    scratch_community_publish: ({ workId }) => `/d/art/scratch/work/${workId}/community`,
    scratch_share_create: ({ workId }) => `/d/art/scratch/work/${workId}/share`,
    scratch_editor: '/d/art/scratch/editor',
};
const url = (name, args = {}) => {
    assert.ok(name in routes, `Unknown template route: ${name}`);
    const base = typeof routes[name] === 'function' ? routes[name](args) : routes[name];
    assert.ok(!base.includes('undefined'), `Missing route parameter: ${name}`);
    const query = new URLSearchParams(Object.entries(args.query || {}).filter(([, value]) => value !== '' && value != null));
    return `${base}${query.size ? `?${query}` : ''}`;
};
const item = {
    _id: 'pub-one', owner: 7, title: '小猫的太空冒险', instructions: '方向键移动，空格键跳跃。',
    revision: 2, workId: 'work-one', thumbnailFileId: 'private-thumbnail-id',
    createdAt: new Date('2026-09-20'), updatedAt: new Date('2026-09-28'),
};
const player = { editorVersion: 'a'.repeat(64), title: item.title, projectUrl: '/d/art/scratch/community/pub-one/project',
    maxFileSize: 20 * 1024 * 1024, memberOnly: true };
const base = {
    url, handler: { user: { _id: 7 } }, UiContext: { scratchPlayer: player },
    communityWorks: [item], communityWork: item, udict: { 7: { uname: '小豆' } },
    page: 1, pcount: 1, count: 1, mine: false, q: '', sort: 'hot', isOwner: true, canEdit: true, canManage: true,
    communityMetrics: { likes: 9, runtimeSeconds: 452, likedToday: false, canLike: true, isTeacher: false },
    datetimeSpan: () => new nunjucks.runtime.SafeString('<time datetime="2026-09-28">刚刚</time>'),
    paginator: { render: (page, count) => new nunjucks.runtime.SafeString(`<nav aria-label="翻页">${page}/${count}</nav>`) },
    utils: { buildQueryString: (values) => new URLSearchParams(values).toString() },
};
function render(t, name, overrides = {}) {
    const dom = new JSDOM(env.render(name, { ...base, ...overrides }), { url: 'https://onebyone.test/d/art/scratch/community' });
    t.after(() => dom.window.close());
    return dom.window.document;
}

describe('Scratch classroom community templates', () => {
    it('renders the complete listing with member cover routes and a single playable card link', (t) => {
        const document = render(t, 'scratch_community.html', { pcount: 2 });
        assert.equal(document.querySelector('h1').textContent, '创作社区✦');
        assert.match(document.querySelector('.sc-community-scope').textContent, /本课堂/);
        const card = document.querySelector('.sc-community-card');
        assert.equal(card.querySelectorAll('a').length, 1);
        assert.equal(card.querySelectorAll('button').length, 0);
        assert.equal(card.querySelector('a').pathname, '/d/art/scratch/community/pub-one');
        assert.equal(card.querySelector('img').getAttribute('src'), `/d/art/scratch/community/pub-one/thumbnail?v=${item.updatedAt.getTime()}`);
        assert.ok(!document.body.innerHTML.includes('private-thumbnail-id'));
        assert.match(card.textContent, /小豆/);
        assert.match(card.textContent, /方向键移动/);
        assert.ok(document.querySelector('[aria-label="翻页"]'));
        assert.equal(document.querySelectorAll('[data-scratch-share-pane]').length, 4);
    });

    it('preserves search across filters and renders missing-cover cards without a broken image', (t) => {
        const document = render(t, 'scratch_community.html', {
            communityWorks: [{ ...item, thumbnailFileId: null }], mine: true, q: '太空',
        });
        assert.equal(document.querySelector('#scratch-community-search').maxLength, 80);
        assert.equal(document.querySelector('.sc-community-sort [aria-current=page]').textContent, '热门');
        assert.equal(document.querySelector('.sc-community-search [name=sort]').value, 'hot');
        for (const link of document.querySelectorAll('.sc-community-sort a')) {
            assert.equal(new URL(link.href).searchParams.get('q'), '太空');
            assert.equal(new URL(link.href).searchParams.get('mine'), '1');
        }
        assert.equal(document.querySelector('#scratch-community-search').value, '太空');
        assert.equal(document.querySelector('.sc-community-search [name=mine]').value, '1');
        assert.equal(document.querySelector('.sc-community-tabs [aria-current=page]').textContent, '我的分享');
        for (const link of document.querySelectorAll('.sc-community-tabs a')) {
            assert.equal(new URL(link.href).searchParams.get('q'), '太空');
        }
        assert.equal(document.querySelectorAll('.sc-community-cover img').length, 0);
        assert.ok(document.querySelector('.sc-community-cover-placeholder'));
    });

    it('distinguishes an empty classroom, first personal share, and a search with no matches', (t) => {
        const common = { communityWorks: [], count: 0 };
        const classroom = render(t, 'scratch_community.html', common);
        assert.match(classroom.querySelector('.sc-community-empty strong').textContent, /第一个登场/);
        const mine = render(t, 'scratch_community.html', { ...common, mine: true });
        assert.match(mine.querySelector('.sc-community-empty strong').textContent, /第一个创意/);
        const search = render(t, 'scratch_community.html', { ...common, q: '不存在', mine: true });
        assert.match(search.querySelector('.sc-community-empty strong').textContent, /还没找到/);
        const clear = [...search.querySelectorAll('.sc-community-empty a')].find((link) => link.textContent === '清除搜索');
        assert.equal(new URL(clear.href).searchParams.get('mine'), '1');
        assert.equal(new URL(clear.href).searchParams.has('q'), false);
    });

    it('renders owner playback, how-to and independent update/withdraw management', (t) => {
        const document = render(t, 'scratch_community_detail.html');
        assert.match(document.querySelector('.sc-community-detail-meta').textContent, /小豆 的创意/);
        assert.match(document.querySelector('.sc-community-howto').textContent, /方向键移动/);
        const root = document.querySelector('[data-scratch-public-player]');
        assert.deepEqual(JSON.parse(root.dataset.config), player);
        assert.equal(root.querySelector('iframe').getAttribute('sandbox'), 'allow-scripts');
        assert.equal(root.querySelector('iframe').hasAttribute('allowfullscreen'), true);
        assert.match(document.querySelector('script[src]').src, /scratch-player\.js\?v=20261004-community-metrics-v1-/);
        assert.equal(document.querySelector('[data-community-direct]').getAttribute('data-community-url'), '/d/art/scratch/work/work-one/community');
        assert.ok(document.querySelector('[data-scratch-community-unpublish]'));
        assert.ok(document.querySelector('[data-scratch-community-unpublish-dialog]'));
    });

    it('shows peers only the player and gives teachers withdrawal without editing another child’s work', (t) => {
        const peer = render(t, 'scratch_community_detail.html', { isOwner: false, canEdit: false, canManage: false });
        assert.ok(peer.querySelector('[data-scratch-public-player]'));
        assert.equal(peer.querySelector('.sc-community-manage'), null);
        assert.equal(peer.querySelector('[data-scratch-community-unpublish-dialog]'), null);
        const teacher = render(t, 'scratch_community_detail.html', { isOwner: false, canEdit: false, canManage: true, communityMetrics: { ...base.communityMetrics, isTeacher: true } });
        assert.ok(teacher.querySelector('[data-scratch-community-unpublish]'));
        assert.equal(teacher.querySelector('[data-community-direct]'), null);
        assert.equal(teacher.querySelector('a[data-no-instant]'), null);
        assert.ok(teacher.querySelector('[data-community-analytics]'));
        assert.ok(teacher.querySelector('[data-community-analytics-dialog]'));
        assert.equal(peer.querySelector('[data-community-analytics]'), null);
        assert.equal(peer.querySelector('[data-community-analytics-dialog]'), null);
        assert.equal(peer.querySelector('[data-community-participants]'), null);
    });

    it('renders student metrics without private member details and marks the daily like limit', (t) => {
        const document = render(t, 'scratch_community_detail.html', {
            communityMetrics: { ...base.communityMetrics, likedToday: true, canLike: false },
        });
        assert.equal(document.querySelector('[data-community-like-count]').textContent, '9');
        assert.equal(document.querySelector('[data-community-runtime]').textContent, '7 分 32 秒');
        assert.equal(document.querySelector('[data-community-like]').disabled, true);
        assert.equal(document.querySelector('[data-community-like]').getAttribute('aria-pressed'), 'true');
        assert.match(document.querySelector('[data-community-like-hint]').textContent, /北京时间/);
        assert.equal(document.querySelector('[data-community-analytics-dialog]'), null);
    });

    it('supports latest sorting and preserves it across search, mine and pagination', (t) => {
        let paginationQuery;
        const document = render(t, 'scratch_community.html', {
            sort: 'latest', q: '猫', mine: true, pcount: 2,
            paginator: { render: (page, count, args) => { paginationQuery = args.add_qs; return ''; } },
            communityWorks: [{ ...item, likes: 12, runtimeSeconds: 7201 }],
        });
        assert.equal(document.querySelector('.sc-community-sort [aria-current=page]').textContent, '最新');
        assert.equal(document.querySelector('.sc-community-search [name=sort]').value, 'latest');
        for (const link of document.querySelectorAll('.sc-community-tabs a')) assert.equal(new URL(link.href).searchParams.get('sort'), 'latest');
        assert.match(paginationQuery, /sort=latest/);
        assert.match(document.querySelector('.sc-community-card-metrics').textContent, /12/);
        assert.match(document.querySelector('.sc-community-card-metrics').textContent, /2 小时/);
    });

    it('escapes child supplied names, instructions, search and player config without breaking attributes', (t) => {
        const untrusted = '\"><img src=x onerror=alert(1)><script>window.injected=true</script>';
        const unsafe = { ...item, title: untrusted, instructions: untrusted };
        const common = { communityWorks: [unsafe], communityWork: unsafe, q: untrusted,
            udict: { 7: { uname: untrusted } }, UiContext: { scratchPlayer: { ...player, title: untrusted } } };
        for (const name of ['scratch_community.html', 'scratch_community_detail.html']) {
            const document = render(t, name, common);
            assert.equal(document.querySelector('[onerror]'), null);
            assert.equal(document.querySelector('img[src=x]'), null);
            assert.equal([...document.querySelectorAll('script')].filter((script) => !script.hasAttribute('src')).length, 0);
            if (name === 'scratch_community.html') {
                assert.equal(document.querySelector('.sc-community-card h3').textContent, untrusted);
                assert.equal(document.querySelector('#scratch-community-search').value, untrusted);
            } else {
                assert.equal(document.querySelector('h1').textContent, untrusted);
                assert.equal(JSON.parse(document.querySelector('[data-scratch-public-player]').dataset.config).title, untrusted);
                assert.equal(document.querySelector('.sc-community-howto p').textContent, untrusted);
            }
        }
    });
});
