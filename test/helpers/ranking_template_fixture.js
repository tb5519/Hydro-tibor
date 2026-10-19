const fs = require('node:fs');
const path = require('node:path');
const nunjucks = require('nunjucks');
const MarkdownIt = require('markdown-it');

const root = path.resolve(__dirname, '../..');
const templateRoot = path.join(root, 'packages/ui-default/templates');
const markdown = new MarkdownIt({ html: false });

class RankingLayoutLoader extends nunjucks.Loader {
    getSource(name) {
        if (name !== 'layout/basic.html') return null;
        return { src: '{% block content %}{% endblock %}', path: 'ranking-fixture/layout.html', noCache: true };
    }
}

function makeUsers() {
    const bios = ['', '认真复习，每天进步。', '这是很长的个人简介，用于验证不同内容长度不会让流光底部留白。'.repeat(5), '![最强王者](badge.svg)', '', '短简介'];
    const counts = [2, 0, 3, 1, 5, 1];
    return bios.map((bio, index) => ({
        _id: index + 1,
        uname: ['520', '秦济舟', '颂严', '周烨', '司马懿', '方全然'][index],
        avatar: `avatar-${index}`,
        bio,
        level: 8 - index,
        rp: 293 - index * 13,
        nAccept: 280 - index * 17,
        ownedBadges: Array.from({ length: counts[index] }, (_, badgeIndex) => ({
            href: `/badge/${index}-${badgeIndex}`,
            displayName: ['🏆最强王者', '👑小丑皇', '⚔2026疾风剑客', '⭐幸运女神', '🌙嫦娥奔月'][badgeIndex],
            backgroundColor: ['#facc15', '#24172c', '#082f49', '#312e81', '#164e3d'][badgeIndex],
            fontColor: badgeIndex ? '#ffffff' : '#1e293b',
        })),
        hasPriv: () => false,
        hasPerm: () => false,
    }));
}

function renderRankingFixture(kind) {
    const env = new nunjucks.Environment([
        new RankingLayoutLoader(),
        new nunjucks.FileSystemLoader(templateRoot, { noCache: true }),
    ], { autoescape: true, throwOnUndefined: true });
    env.addFilter('markdownInline', (value) => new nunjucks.runtime.SafeString(markdown.renderInline(String(value))));
    const labels = { Rank: '排名', Username: '用户名', Bio: '个人简介', Accept: '通过', Ranking: '排名', More: '更多' };
    env.addGlobal('_', (value) => labels[value] || String(value));
    env.addGlobal('url', (route, params = {}) => route === 'user_detail' ? `/user/${params.uid}` : `/route/${route}`);
    env.addGlobal('avatarUrl', () => 'avatar.svg');
    const udocs = makeUsers();
    const context = {
        udocs,
        udict: Object.fromEntries(udocs.map((user) => [user._id, user])),
        payload: udocs.map((user) => user._id),
        handler: { user: { hasPerm: () => false, hasPriv: () => false } },
        PRIV: { PRIV_USER_PROFILE: 1, PRIV_MOD_BADGE: 2 },
        perm: { PERM_VIEW_USER_PRIVATE_INFO: 1, PERM_MOD_BADGE: 2 },
        model: { builtin: { LEVELS: Array.from({ length: 10 }, (_, index) => index * 10) }, system: { get: () => 50 }, rp: {} },
        rankingMode: 'all',
        page: 1,
        upcount: 0,
    };
    return kind === 'ranking'
        ? env.render('ranking.html', context)
        : env.renderString('{% import "components/user.html" as user with context %}{% include "partials/homepage/ranking.html" %}', context);
}

function productionCss() {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'packages/ui-default/public/manifest.json'), 'utf8'));
    const filename = manifest['theme.css'].split('?')[0].replace(/^\//, '');
    return fs.readFileSync(path.join(root, 'packages/ui-default/public', filename), 'utf8');
}

module.exports = { root, makeUsers, renderRankingFixture, productionCss };
