const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const workspaceRoot = path.resolve(__dirname, '..');
const defaultTemplateRoot = path.join(workspaceRoot, 'packages/ui-default/templates');
const badgeTemplateRoot = path.join(workspaceRoot, 'addons/badge-for-hydrooj/templates');

class LayoutLoader extends nunjucks.Loader {
    getSource(name) {
        if (name !== 'layout/basic.html') return null;
        return {
            src: '<!doctype html><html><body>{% block content %}{% endblock %}</body></html>',
            path: 'test/layout/basic.html',
            noCache: true,
        };
    }
}

function formatString(...args) {
    return String(this).replace(/\{(\d+)\}/g, (match, index) => (
        Object.hasOwn(args, Number(index)) ? args[Number(index)] : match
    ));
}

function createTemplateEnvironment(componentVariant) {
    const searchPaths = componentVariant === 'plugin'
        ? [badgeTemplateRoot, defaultTemplateRoot]
        : [defaultTemplateRoot];
    const env = new nunjucks.Environment([
        new LayoutLoader(),
        new nunjucks.FileSystemLoader(searchPaths, { noCache: true }),
    ], { autoescape: true, throwOnUndefined: true });

    env.addFilter('nl2br', (value) => new nunjucks.runtime.SafeString(String(value).replace(/\n/g, '<br>')));
    env.addGlobal('_', (value) => String(value));
    env.addGlobal('avatarUrl', (value) => `/avatar/${value || 'default'}`);
    env.addGlobal('set', (target, key, value) => {
        target[key] = value;
        return '';
    });
    env.addGlobal('url', (route, options = {}) => {
        if (route === 'user_detail') return `/user/${options.uid}`;
        if (route === 'record_detail') return `/record/${options.rid}`;
        if (route === 'problem_detail') {
            const tid = options.query?.tid;
            return `/problem/${options.pid}${tid ? `?tid=${tid}` : ''}`;
        }
        return `/route/${route}`;
    });
    return env;
}

function makeBadge(uid, index) {
    return {
        href: `/badge/${uid}-${index}`,
        backgroundColor: `#${String(uid + index).padStart(6, '0').slice(-6)}`,
        fontColor: '#ffffff',
        displayName: `Badge ${uid}-${index}`,
        tooltip: `Owned badge ${uid}-${index}`,
    };
}

const userFixtures = [
    { uid: 100, badgeCount: 0 },
    { uid: 101, badgeCount: 1 },
    { uid: 102, badgeCount: 2 },
    { uid: 103, badgeCount: 3 },
    { uid: 105, badgeCount: 5 },
    { uid: 121, badgeCount: 21 },
    { uid: 130, badgeCount: 1, fallback: true },
];

function createRawUser({ uid, badgeCount, fallback }) {
    const udoc = {
        _id: uid,
        uname: `student-${uid}`,
        displayName: `Student ${uid}`,
        avatar: `avatar-${uid}`,
        level: uid === 103 ? 6 : 0,
    };
    if (fallback) {
        udoc.badge = 'fallback-slug#Fallback Badge#112233#ffffff#Fallback tip';
    } else {
        udoc.ownedBadges = Array.from({ length: badgeCount }, (_, index) => makeBadge(uid, index + 1));
    }
    return udoc;
}

function createRenderContext(embeddedScoreboard = false) {
    const udict = Object.fromEntries(userFixtures.map((fixture) => [fixture.uid, createRawUser(fixture)]));
    const header = [
        { type: 'rank', value: 'Rank' },
        { type: 'user', value: 'User' },
        { type: 'record', value: 'Total' },
        { type: 'problem', raw: 69, value: 'P69' },
    ];
    const body = userFixtures.map(({ uid }, index) => [
        { type: 'rank', value: index + 1 },
        { type: 'user', raw: uid },
        {
            type: 'record',
            raw: `score-${uid}`,
            value: 300 - index * 7,
            score: 300 - index * 7,
            hover: `Total score for ${uid}`,
        },
        {
            type: 'record',
            raw: `problem-${uid}`,
            value: 100 - index,
            score: 100 - index,
            hover: `Problem score for ${uid}`,
            ...(uid === 103 ? { style: 'background:#ffe58f' } : {}),
        },
    ]);
    const pdict = {
        69: { title: 'Problem 69', nAccept: 7, nSubmit: 9 },
    };
    const context = {
        UiContext: {},
        availableViews: {},
        embeddedScoreboard,
        groups: [],
        handler: {
            user: {
                _id: 999,
                hasPerm: () => true,
                own: () => true,
            },
        },
        model: {
            builtin: { LEVELS: Array.from({ length: 10 }, (_, index) => index * 10) },
            contest: {
                canShowRecord: () => true,
                isDone: () => true,
                isLocked: () => false,
            },
        },
        pdict,
        perm: {
            PERM_MOD_BADGE: 1,
            PERM_VIEW_DISPLAYNAME: 2,
            PERM_VIEW_USER_PRIVATE_INFO: 3,
        },
        PRIV: { PRIV_MOD_BADGE: 1 },
        rows: [header, ...body],
        tdoc: { docId: 'contest-badge-test', rule: 'ioi' },
        tsdoc: {},
        udict,
        utils: { status: { getScoreColor: () => '#00aa00' } },
    };
    if (embeddedScoreboard) {
        context.embeddedScoreboardUdict = udict;
        context.embeddedScoreboardPdict = pdict;
    }
    return context;
}

function renderScoreboard(componentVariant, mode) {
    const environment = createTemplateEnvironment(componentVariant);
    const template = mode === 'standalone' ? 'contest_scoreboard.html' : 'partials/scoreboard.html';
    const context = createRenderContext(mode === 'embedded');
    const originalFormat = String.prototype.format;
    Object.defineProperty(String.prototype, 'format', {
        configurable: true,
        value: formatString,
        writable: true,
    });
    try {
        return environment.render(template, context);
    } finally {
        if (originalFormat) {
            Object.defineProperty(String.prototype, 'format', {
                configurable: true,
                value: originalFormat,
                writable: true,
            });
        } else {
            delete String.prototype.format;
        }
    }
}

function normalizeText(element) {
    return element.textContent.replace(/\s+/g, ' ').trim();
}

function inspectScoreboard(html) {
    const document = new JSDOM(html).window.document;
    const table = document.querySelector('table.contest-scoreboard-table');
    assert.ok(table, 'the real scoreboard template should render its table');
    const rows = [...table.tBodies[0].rows];
    return { document, table, rows };
}

function expectedBadgeLevel(fixture) {
    return Math.min(fixture.badgeCount, 20);
}

function assertRenderedContract(componentVariant, mode) {
    const { table, rows } = inspectScoreboard(renderScoreboard(componentVariant, mode));
    assert.ok(table.classList.contains('ranking-badge-effects'));
    assert.equal(table.classList.contains('contest-embedded-scoreboard__table'), mode === 'embedded');
    assert.equal(rows.length, userFixtures.length);

    for (const [index, fixture] of userFixtures.entries()) {
        const row = rows[index];
        const expectedLevel = expectedBadgeLevel(fixture);
        assert.equal(row.classList.contains('ranking-row--badge'), expectedLevel > 0, `uid ${fixture.uid}: badge row marker`);
        for (let level = 1; level <= 20; level++) {
            assert.equal(
                row.classList.contains(`ranking-row--badge-${level}`),
                level === expectedLevel && expectedLevel > 0,
                `uid ${fixture.uid}: glow level ${level}`,
            );
        }

        const userLink = row.querySelector('.user-profile-name');
        assert.equal(userLink.getAttribute('href'), `/user/${fixture.uid}`);
        assert.match(normalizeText(userLink), new RegExp(`student-${fixture.uid}`));

        const totalRecord = row.querySelector(`td.col--record a[href="/record/score-${fixture.uid}"]`);
        const problemRecord = row.querySelector(`td.col--problem a[href="/record/problem-${fixture.uid}"]`);
        assert.ok(totalRecord, `uid ${fixture.uid}: total record link remains visible`);
        assert.ok(problemRecord, `uid ${fixture.uid}: problem record link remains visible`);
        assert.equal(normalizeText(totalRecord), String(300 - index * 7));
        assert.equal(normalizeText(problemRecord), String(100 - index));
        assert.equal(Boolean(row.querySelector(`button.star[data-uid="${fixture.uid}"]`)), mode !== 'embedded');

        const customBadges = [...row.querySelectorAll('.ranking-user__badge')];
        const visibleBadges = customBadges.filter((element) => !element.classList.contains('user-profile-badge--more'));
        const overflowBadge = customBadges.find((element) => element.classList.contains('user-profile-badge--more'));
        if (fixture.fallback) {
            assert.equal(visibleBadges.length, 1);
            assert.equal(normalizeText(visibleBadges[0]), 'Fallback Badge');
            assert.equal(visibleBadges[0].getAttribute('href'), '/badge/fallback-slug');
            assert.equal(overflowBadge, undefined);
        } else {
            assert.equal(visibleBadges.length, Math.min(fixture.badgeCount, 4));
            if (fixture.badgeCount > 4) {
                assert.ok(overflowBadge);
                assert.equal(normalizeText(overflowBadge), `+${fixture.badgeCount - 4}`);
            } else {
                assert.equal(overflowBadge, undefined);
            }
        }
    }

    const problemHeader = table.querySelector('thead th.col--problem a');
    assert.equal(problemHeader.getAttribute('href'), '/problem/69?tid=contest-badge-test');
    assert.equal(normalizeText(problemHeader), 'P697/9');
    assert.equal(table.querySelectorAll('button.star').length, mode === 'embedded' ? 0 : userFixtures.length);

    const firstAcCell = rows[3].querySelector('td.col--problem[data-scoreboard-cell-style]');
    assert.ok(firstAcCell, 'a first-AC/result cell keeps the style-preservation marker');
    assert.equal(firstAcCell.getAttribute('style'), 'background:#ffe58f');
}

function cssRuleBody(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(match, `missing CSS rule: ${selector}`);
    return match[1];
}

function cssVariables(body) {
    return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

describe('contest scoreboard multi-badge rendering', () => {
    for (const componentVariant of ['default', 'plugin']) {
        for (const mode of ['standalone', 'pjax', 'embedded']) {
            it(`uses the ${componentVariant} user component in ${mode} mode without changing rows or links`, () => {
                assertRenderedContract(componentVariant, mode);
            });
        }
    }

    it('renders identical badge levels for the standalone page, PJAX fragment, and embedded scoreboard', () => {
        for (const componentVariant of ['default', 'plugin']) {
            const levelsByMode = Object.fromEntries(['standalone', 'pjax', 'embedded'].map((mode) => {
                const { rows } = inspectScoreboard(renderScoreboard(componentVariant, mode));
                return [mode, rows.map((row) => [...row.classList].filter((name) => name.startsWith('ranking-row--badge'))).join(' ')];
            }));
            assert.deepEqual(levelsByMode.standalone, levelsByMode.pjax);
            assert.deepEqual(levelsByMode.standalone, levelsByMode.embedded);
        }
    });
});

describe('shared ranking badge effect contract', () => {
    const effectsPath = path.join(defaultTemplateRoot, 'partials/ranking_badge_effects.html');
    const scoreboardStylesPath = path.join(defaultTemplateRoot, 'partials/scoreboard_badge_styles.html');
    const scoreboardPath = path.join(defaultTemplateRoot, 'partials/scoreboard.html');
    const rankingPath = path.join(defaultTemplateRoot, 'ranking.html');
    const problemListPath = path.join(defaultTemplateRoot, 'contest_problemlist.html');
    const effects = fs.readFileSync(effectsPath, 'utf8');
    const scoreboardStyles = fs.readFileSync(scoreboardStylesPath, 'utf8');
    const scoreboard = fs.readFileSync(scoreboardPath, 'utf8');
    const ranking = fs.readFileSync(rankingPath, 'utf8');
    const problemList = fs.readFileSync(problemListPath, 'utf8');

    it('keeps all twenty original glow levels and their representative visual signatures', () => {
        for (let level = 1; level <= 20; level++) {
            cssRuleBody(effects, `.ranking-badge-effects tbody tr.ranking-row--badge-${level}`);
        }

        const base = cssVariables(cssRuleBody(effects, '.ranking-badge-effects tbody tr.ranking-row--badge'));
        const signatures = {
            1: {
                'badge-edge': '#60a5fa', 'badge-edge-width': '4px', 'badge-alpha': '.22',
                'badge-alpha-2': '.18', 'badge-alpha-3': '.14', 'badge-wash': '.74',
                'badge-wash-2': '.52', 'badge-orbit-size': '38px', 'badge-glow-size': '18px',
                'badge-flow-speed': '8.4s', 'badge-scan-speed': '4.6s', 'badge-scan-width': '34%',
            },
            2: {
                'badge-edge': '#a855f7', 'badge-edge-width': '6px', 'badge-alpha': '.34',
                'badge-alpha-2': '.28', 'badge-alpha-3': '.22', 'badge-wash': '.66',
                'badge-wash-2': '.38', 'badge-orbit-size': '44px', 'badge-glow-size': '24px',
                'badge-flow-speed': '7.2s', 'badge-scan-speed': '3.9s', 'badge-scan-width': '42%',
            },
            3: {
                'badge-edge': '#f59e0b', 'badge-edge-width': '8px', 'badge-alpha': '.42',
                'badge-alpha-2': '.36', 'badge-alpha-3': '.32', 'badge-wash': '.58',
                'badge-wash-2': '.28', 'badge-orbit-size': '50px', 'badge-glow-size': '32px',
                'badge-flow-speed': '6.3s', 'badge-scan-speed': '3.4s', 'badge-scan-width': '50%',
            },
            5: {
                'badge-edge': '#facc15', 'badge-edge-width': '10px', 'badge-alpha': '.56',
                'badge-alpha-2': '.48', 'badge-alpha-3': '.42', 'badge-wash': '.44',
                'badge-wash-2': '.18', 'badge-orbit-size': '62px', 'badge-glow-size': '48px',
                'badge-flow-speed': '5s', 'badge-scan-speed': '2.7s', 'badge-scan-width': '66%',
            },
            20: {
                'badge-edge': '#ffffff', 'badge-edge-width': '26px', 'badge-alpha': '.995',
                'badge-alpha-2': '.94', 'badge-alpha-3': '.88', 'badge-wash': '.03',
                'badge-wash-2': '.01', 'badge-orbit-size': '180px', 'badge-glow-size': '196px',
                'badge-flow-speed': '1.4s', 'badge-scan-speed': '.7s', 'badge-scan-width': '190%',
            },
        };
        for (const [level, expected] of Object.entries(signatures)) {
            const overrides = cssVariables(cssRuleBody(effects, `.ranking-badge-effects tbody tr.ranking-row--badge-${level}`));
            const actual = { ...base, ...overrides };
            for (const [property, value] of Object.entries(expected)) {
                assert.equal(actual[property], value, `level ${level}: --${property}`);
            }
        }
        assert.match(effects, /animation:\s*ranking-row-flow var\(--badge-flow-speed\) linear infinite/);
        assert.match(effects, /@keyframes\s+ranking-row-flow/);
        assert.match(effects, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*ranking-row--badge\s*\{\s*animation:\s*none;/);
    });

    it('is shared by ranking and every scoreboard, including reduced-motion badge shine', () => {
        assert.match(ranking, /include\s+"partials\/ranking_badge_effects\.html"/);
        assert.match(ranking, /<table class="data-table ranking-table ranking-badge-effects">/);
        assert.match(scoreboardStyles, /include\s+"partials\/ranking_badge_effects\.html"/);
        assert.match(scoreboard, /include\s+"partials\/scoreboard_badge_styles\.html"/);
        assert.match(scoreboard, /contest-scoreboard-table ranking-badge-effects/);
        assert.match(scoreboardStyles, /animation:\s*contest-scoreboard-badge-shine 3\.2s ease-in-out infinite/);
        assert.match(
            scoreboardStyles,
            /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*ranking-user__badge:not\(\.user-profile-badge--more\):after\s*\{\s*animation:\s*none;/,
        );
        assert.doesNotMatch(problemList, /contest-scoreboard-row--badge|contest-scoreboard-row-shine|--contest-badge-alpha/);
    });

    it('keeps the starred/current-user marker visible without replacing the badge edge', () => {
        const starredCells = cssRuleBody(
            scoreboardStyles,
            '.contest-scoreboard-table tbody tr.ranking-row--badge.star-highlight td',
        );
        const starredFirstCell = cssRuleBody(
            scoreboardStyles,
            '.contest-scoreboard-table tbody tr.ranking-row--badge.star-highlight td:first-child',
        );
        assert.match(starredCells, /box-shadow:\s*inset 0 1px 0 #93c5fd,\s*inset 0 -1px 0 #93c5fd;/);
        assert.match(starredFirstCell, /inset var\(--badge-edge-width\) 0 0 var\(--badge-edge\)/);
        assert.match(starredFirstCell, /inset 0 1px 0 #93c5fd,\s*inset 0 -1px 0 #93c5fd/);
    });

    it('preserves explicit result-cell colors while clearing ordinary cell backgrounds', () => {
        assert.match(scoreboard, /data-scoreboard-cell-style style="\{\{ column\.style \}\}"/);
        assert.match(
            effects,
            /tr\.ranking-row--badge td:not\(\[data-scoreboard-cell-style\]\)\s*\{\s*background:\s*transparent !important;/,
        );
        assert.doesNotMatch(
            effects,
            /tr\.ranking-row--badge td\s*\{[^}]*background:\s*transparent !important;/s,
        );
    });
});
