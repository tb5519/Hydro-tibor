const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const templates = path.join(root, 'packages/ui-default/templates');
const cardName = 'partials/homepage/ac_difficulty.html';
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templates), {
    autoescape: true, throwOnUndefined: true,
});
const moduleFixture = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/profile_ac_difficulty.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: moduleFixture, exports: moduleFixture.exports });

function renderedPage(html) {
    const dom = new JSDOM(html);
    return { html, document: dom.window.document, close: () => dom.window.close() };
}

function render(problems, acDifficultyScope = 'single') {
    const acDifficulty = moduleFixture.exports.getProfileAcDifficulty(problems);
    return renderedPage(env.render(cardName, { acDifficulty, acDifficultyScope }));
}

class ProfileTemplateLoader extends nunjucks.Loader {
    getSource(name) {
        // Keep the page and problem link macros real; shell/sidebar/badge
        // rendering is unrelated to the private card and profile statistics.
        const shells = {
            'layout/basic.html': '{% block content %}{% endblock %}',
            'components/home.html': '{% macro render_sidebar() %}{% endmacro %}',
            'components/user.html': '{% macro render_custom_badges() %}{% endmacro %}',
        };
        return { src: shells[name] ?? fs.readFileSync(path.join(templates, name), 'utf8'), path: name };
    }
}
const pageEnv = new nunjucks.Environment(new ProfileTemplateLoader(), { autoescape: true });
pageEnv.addFilter('markdown', (value) => value);
function translate(value) {
    const text = new String(value); // A local formatter avoids patching String.prototype.
    text.format = (...args) => value.replace(/\{(\d+)\}/g, (_, index) => args[+index]);
    return text;
}

function renderHome({ problems, scope = 'single', payload = {}, member = true } = {}) {
    const stats = payload === null ? null : {
        uid: 22, rp: 321.5, rank: 4, newAc7: 3, newAc30: 15, rankingMode: scope,
        ...(problems ? { acDifficulty: moduleFixture.exports.getProfileAcDifficulty(problems) } : {}),
        ...payload,
    };
    return renderedPage(pageEnv.render('partials/homepage/personal_stats.html', {
        payload: stats,
        udict: member ? { 22: { _id: 22, uname: '测试学员', avatar: '', ownedBadges: [] } } : {},
        user: { render_inline: () => '测试学员', render_custom_badges: () => '' },
        avatarUrl: () => '/avatar.png', pointLottery: { points: 8 },
    }));
}

function renderProfile({ profileStats, isSelfProfile = false, pdocs = [] } = {}) {
    return renderedPage(pageEnv.render('user_detail.html', {
        profileStats, isSelfProfile, pdocs,
        // Deliberately conflicting local values catch accidental scope fallback.
        udoc: { _id: 22, uname: '测试学员', avatar: '', nAccept: 11, nSubmit: 16, nLiked: 2,
            rp: 129.22, rank: 11, bio: '', hasPriv: () => true, hasPerm: () => false },
        handler: { user: { _id: isSelfProfile ? 22 : 30, hasPriv: () => false, hasPerm: () => false } },
        PRIV: {}, perm: {}, badgeProfileBackground: {}, profileBadgeSound: {}, UiContext: {},
        Math, Object, _: translate, set: (object, key, value) => { object[key] = value; return ''; },
        findSubModule: () => [], nothing: { render: () => '暂无简介' },
        datetimeSpan: () => '2026-10-01', assetUrl: (value) => value, avatarUrl: () => '/avatar.png',
        url: (name, args) => `/d/${encodeURIComponent(args?.domainId || 'current')}/p/${encodeURIComponent(args?.pid || '')}`,
    }));
}

describe('private homepage AC difficulty card rendering', () => {
    it('renders ten distinct level counts, current AC total and highest solved difficulty', () => {
        const problems = [];
        for (let difficulty = 1; difficulty <= 10; difficulty++) {
            for (let count = 0; count < difficulty; count++) {
                problems.push({ domainId: 'python', docId: problems.length + 1, difficulty });
            }
        }
        // Duplicate accepted metadata must not inflate either the rows or total.
        problems.push(problems[0]);
        const page = render(problems);
        const rows = [...page.document.querySelectorAll('ol li')];
        assert.equal(rows.length, 10);
        rows.forEach((row, index) => {
            const level = index + 1;
            assert.equal(row.querySelector('[class$="__level"]').textContent, `${level}`);
            assert.equal(row.querySelector('[class$="__count"]').textContent, `${level}题`);
            assert.equal(row.querySelector('[class$="__track"] > span').style.width, `${level * 10}%`);
        });
        assert.equal(page.document.querySelector('[class$="__total"] strong').textContent, '55');
        assert.equal(page.document.querySelector('[class$="__highest"] strong').textContent, '10');
        assert.equal(page.document.querySelector('[class$="__unrated"]'), null);
        page.close();
    });

    it('separates ungraded ACs from level one and keeps bar widths relative to the largest level', () => {
        const page = render([
            { domainId: 'python', docId: 1, difficulty: 6 },
            { domainId: 'python', docId: 2, difficulty: 6 },
            { domainId: 'python', docId: 3, difficulty: 9 },
            { domainId: 'python', docId: 4 },
            { domainId: 'python', docId: 5, difficulty: 0 },
        ]);
        const rows = [...page.document.querySelectorAll('ol li')];
        assert.equal(page.document.querySelector('[class$="__total"] strong').textContent, '5');
        assert.equal(rows[0].querySelector('[class$="__count"]').textContent, '0题');
        assert.equal(rows[5].querySelector('[class$="__track"] > span').style.width, '100%');
        assert.equal(rows[8].querySelector('[class$="__track"] > span').style.width, '50%');
        assert.equal(page.document.querySelector('[class$="__unrated"] strong').textContent, '2');
        assert.equal(page.document.querySelector('[class$="__footnote"]'), null);
        assert.doesNotMatch(page.document.body.textContent, /按题目当前设置的难度统计/);
        page.close();
    });

    it('shows a useful empty state with all zero counts and no invalid numerical widths', () => {
        const page = render([]);
        assert.equal(page.document.querySelector('[class$="__total"] strong').textContent, '0');
        assert.equal(page.document.querySelector('[class$="__highest"]'), null);
        assert.match(page.document.querySelector('[class$="__summary-note"]').textContent, /第一道挑战/);
        assert.equal(page.document.querySelector('[class$="__footnote"]'), null);
        for (const row of page.document.querySelectorAll('ol li')) {
            assert.equal(row.querySelector('[class$="__count"]').textContent, '0题');
            assert.equal(row.querySelector('[class$="__track"] > span').style.width, '0%');
        }
        assert.doesNotMatch(page.html, /NaN|Infinity|undefined/);
        page.close();
    });

    it('distinguishes existing ungraded ACs from a never-solved profile', () => {
        const page = render([{ domainId: 'python', docId: 1, difficulty: 0 }]);
        assert.equal(page.document.querySelector('[class$="__highest"]'), null);
        assert.match(page.document.querySelector('[class$="__summary-note"]').textContent, /题目暂未设置难度/);
        assert.equal(page.document.querySelector('[class$="__unrated"] strong').textContent, '1');
        assert.equal(page.document.querySelector('[class$="__footnote"]'), null);
        page.close();
    });

    it('renders large counts faithfully and never interpolates problem metadata into HTML or inline styles', () => {
        const problems = Array.from({ length: 10001 }, (_, index) => ({
            domainId: 'python', docId: index + 1, difficulty: 2,
            title: '<img src=x onerror=alert(1)>', tag: ['<script>alert(1)</script>'],
        }));
        problems.push({ domainId: 'python', docId: 20000, difficulty: '1; color:red; --evil:<script>' });
        const page = render(problems);
        assert.equal(page.document.querySelector('[class$="__total"] strong').textContent, '10002');
        assert.equal(page.document.querySelector('[data-level="2"] [class$="__count"]').textContent, '10001题');
        assert.equal(page.document.querySelector('[data-level="2"] [class$="__track"] > span').getAttribute('style'), 'width: 100%');
        assert.equal(page.document.querySelector('[class$="__unrated"] strong').textContent, '1');
        assert.equal(page.document.querySelectorAll('script, img, [onerror]').length, 0);
        assert.doesNotMatch(page.html, /evil|color:red|alert\(1\)/);
        page.close();
    });

    it('labels difficulty numbers without school-grade or editor-level terminology in every state', () => {
        const states = [
            [],
            [{ domainId: 'python', docId: 1, difficulty: 10 }],
            [{ domainId: 'python', docId: 1, difficulty: 0 }],
        ];
        for (const problems of states) {
            const page = render(problems);
            assert.doesNotMatch(page.document.body.textContent, /级|Lv\./);
            const unrated = page.document.querySelector('[class$="__unrated"]');
            if (unrated) assert.match(unrated.textContent, /未设置难度/);
            page.close();
        }
    });

    it('labels the selected all-domain or current-classroom scope without a footer', () => {
        for (const [scope, subtitle] of [['single', '当前课堂'], ['all', '全域']]) {
            const page = render([{ domainId: 'python', docId: 1, difficulty: 7 }], scope);
            assert.equal(page.document.querySelector('.profile-ac-difficulty__header p').textContent, `${subtitle} · 每道题只计一次`);
            assert.equal(page.document.querySelector('.profile-ac-difficulty__footnote'), null);
            page.close();
        }
    });

    it('places the card inside my growth on the signed-in homepage and replaces the mistake list', () => {
        const page = renderHome({ scope: 'all', problems: [
            { domainId: 'python', docId: 1, difficulty: 2 },
            { domainId: 'cpp', docId: 1, difficulty: 9 },
        ], payload: { mistakes: [{ pdoc: { title: '旧的错题区内容' } }] } });
        assert.equal(page.document.querySelectorAll('.homepage-personal .profile-ac-difficulty').length, 1);
        assert.equal(page.document.querySelector('.profile-ac-difficulty__total strong').textContent, '2');
        assert.equal(page.document.querySelector('.profile-ac-difficulty__header p').textContent, '全域 · 每道题只计一次');
        assert.equal(page.document.querySelector('.homepage-personal__mistakes'), null);
        assert.doesNotMatch(page.document.body.textContent, /我的错题集|旧的错题区内容/);
        page.close();
    });

    it('does not create a public or anonymous card when personal stats or member data is absent', () => {
        for (const options of [{ payload: null }, { member: false, problems: [] }, {}]) {
            const page = renderHome(options);
            assert.equal(page.document.querySelector('.profile-ac-difficulty'), null);
            page.close();
        }
    });

    it('keeps the card off public profiles, including the owner viewing their own public profile', () => {
        for (const isSelfProfile of [false, true]) {
            const page = renderProfile({ isSelfProfile });
            assert.equal(page.document.querySelector('.profile-ac-difficulty'), null);
            assert.doesNotMatch(page.document.body.textContent, /AC 难度分布|按题目当前设置的难度统计/);
            page.close();
        }
    });

    it('renders all-domain RP, rank, accepted, submitted, and solution likes from one profile statistics scope', () => {
        const page = renderProfile({ profileStats: { rp: 491.46, rank: 3, nAccept: 208, nSubmit: 361, nLiked: 19 } });
        assert.match(page.document.querySelector('.profile-header__main').textContent, /Solved 208 problems, RP: 491\.46 \(No\. 3\)/);
        const totals = [...page.document.querySelectorAll('.sidebar-user-stat .numbox__num')].map((item) => item.textContent.trim());
        assert.deepEqual(totals, ['361', '208', '19']);
        page.close();
    });

    it('retains current-classroom statistics when the public profile has no shared override', () => {
        const page = renderProfile();
        assert.match(page.document.querySelector('.profile-header__main').textContent, /Solved 11 problems, RP: 129\.22 \(No\. 11\)/);
        assert.deepEqual([...page.document.querySelectorAll('.sidebar-user-stat .numbox__num')].map((item) => item.textContent.trim()), ['16', '11', '2']);
        page.close();
    });

    it('keeps matching problem IDs from different domains linked to their own problem pages', () => {
        const page = renderProfile({ pdocs: [
            { domainId: 'python', docId: 7, pid: 'P7', title: 'Python中的题目' },
            { domainId: 'cpp', docId: 7, pid: 'P7', title: 'C++中的题目' },
            { domainId: 'other classroom', docId: 9, title: '另一个课堂' },
        ] });
        const links = [...page.document.querySelectorAll('.profile-content a[data-no-instant]')];
        assert.deepEqual(links.map((link) => link.getAttribute('href')), ['/d/python/p/P7', '/d/cpp/p/P7', '/d/other%20classroom/p/9']);
        assert.deepEqual(links.map((link) => link.getAttribute('data-tooltip')), ['Python中的题目', 'C++中的题目', '另一个课堂']);
        page.close();
    });
});
