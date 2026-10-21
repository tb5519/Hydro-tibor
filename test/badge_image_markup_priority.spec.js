const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const root = path.resolve(__dirname, '..');
const badge = { id: 7, href: '/badge/7', displayName: '夏日剑客', backgroundColor: '#123456', fontColor: '#abcdef',
    tooltip: '夏天专属徽章', iconUrl: '/d/Python/badge/7/icon-image?v=2' };
const user = (id) => ({ _id: id, uname: `学员 ${id}`, rp: 80, nAccept: 3, nSubmit: 5, bio: '', level: 2,
    ownedBadges: [{ ...badge, id, href: `/badge/${id}`, iconUrl: `/d/Python/badge/${id}/icon-image?v=2` }],
    hasPerm: () => false, hasPriv: () => false });

function environment(templateRoot = 'packages/ui-default/templates') {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, templateRoot)), { autoescape: true });
    env.addFilter('markdownInline', (value) => value);
    return env;
}
const context = (extra = {}) => ({ badge, _: (value) => value, avatarUrl: () => '/avatar.png',
    url: (name, options = {}) => name === 'user_detail' ? `/user/${options.uid}` : `/route/${name}`,
    PRIV: { PRIV_USER_PROFILE: 1, PRIV_MOD_BADGE: 2 }, perm: { PERM_VIEW_USER_PRIVATE_INFO: 1, PERM_MOD_BADGE: 2 },
    handler: { user: { hasPerm: () => false, hasPriv: () => false } },
    model: { builtin: { LEVELS: [100, 50, 10] }, rp: {}, system: { get: () => 50 } },
    page: 1, rankingMode: 'all', upcount: 0, ...extra });
function render(source, data = {}, templateRoot) {
    return new JSDOM(environment(templateRoot).renderString(source, context(data)));
}
function assertLoading(icon, priority) {
    assert.ok(icon);
    const parent = icon.parentElement;
    assert.equal(parent.dataset.badgeIconState, 'loading');
    assert.equal(parent.getAttribute('aria-busy'), 'true');
    assert.ok(parent.getAttribute('aria-label'));
    assert.equal(parent.querySelector('[data-badge-icon-fallback]').getAttribute('aria-hidden'), 'true');
    assert.equal(icon.hidden, true);
    assert.equal(icon.getAttribute('loading'), 'eager');
    assert.equal(icon.getAttribute('fetchpriority'), priority);
    assert.equal(icon.getAttribute('crossorigin'), null, 'match the credential mode of the existing authenticated image route');
}

describe('badge image markup priority and first-paint contract', () => {
    for (const templateRoot of ['packages/ui-default/templates', 'addons/badge-for-hydrooj/templates']) {
        it(`renders a named loading placeholder before JavaScript runs in ${templateRoot}`, () => {
            const dom = render("{% import 'components/user.html' as user with context %}{{ user.render_custom_badge_item(badge, '', 'high') }}", {}, templateRoot);
            try { assertLoading(dom.window.document.querySelector('[data-badge-icon]'), 'high'); }
            finally { dom.window.close(); }
        });

        it(`preserves ordinary text-only badges and permits lower-priority offscreen artwork in ${templateRoot}`, () => {
            const dom = render("{% import 'components/user.html' as user with context %}{{ user.render_custom_badge_item(textBadge) }}{{ user.render_custom_badge_item(badge) }}",
                { textBadge: { ...badge, iconUrl: '' } }, templateRoot);
            try {
                const text = dom.window.document.querySelector('a');
                assert.equal(text.textContent.trim(), badge.displayName);
                assert.equal(text.hasAttribute('data-badge-icon-state'), false);
                assert.equal(text.hasAttribute('aria-busy'), false);
                assertLoading(dom.window.document.querySelector('[data-badge-icon]'), 'auto');
            } finally { dom.window.close(); }
        });
    }

    it('prioritizes only the first eight ranking rows and retains loading placeholders in live fragments', () => {
        const users = Array.from({ length: 12 }, (_, index) => user(index + 10));
        const dom = render("{% include 'partials/ranking_content.html' %}", { udocs: users });
        try {
            const icons = [...dom.window.document.querySelectorAll('[data-badge-icon]')];
            assert.equal(icons.length, users.length);
            icons.forEach((icon, index) => assertLoading(icon, index < 8 ? 'high' : 'auto'));
        } finally { dom.window.close(); }
    });

    it('applies the same bounded priorities to the homepage live ranking fragment', () => {
        const users = Array.from({ length: 10 }, (_, index) => user(index + 10));
        const dom = render("<table><tbody>{% include 'partials/homepage/ranking_rows.html' %}</tbody></table>", {
            payload: users.map((item) => item._id), udict: Object.fromEntries(users.map((item) => [item._id, item])),
        });
        try {
            const icons = [...dom.window.document.querySelectorAll('[data-badge-icon]')];
            assert.equal(icons.length, users.length);
            icons.forEach((icon, index) => assertLoading(icon, index < 8 ? 'high' : 'auto'));
        } finally { dom.window.close(); }
    });

    it('gives the current learner’s personal badges high priority without changing their versioned URLs', () => {
        const student = user(11);
        const dom = render("{% import 'components/user.html' as user with context %}{{ user.render_custom_badges(udoc, 6, 'homepage-personal__badge', 'high') }}", { udoc: student });
        try {
            const icon = dom.window.document.querySelector('[data-badge-icon]');
            assertLoading(icon, 'high');
            assert.equal(icon.getAttribute('src'), student.ownedBadges[0].iconUrl);
        } finally { dom.window.close(); }
    });

    it('renders dynamic homepage lottery badges into loading state with explicit high image priority', () => {
        const source = fs.readFileSync(path.join(root, 'packages/ui-default/templates/main.html'), 'utf8');
        const helpers = source.slice(source.indexOf('  function prizeBadgeStyle('), source.indexOf('  function prizeImagePlaceholder('));
        const sandbox = { pointLottery: {}, escapeHtml: (value) => `${value || ''}`.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;') };
        vm.runInNewContext(helpers, sandbox);
        const dom = new JSDOM(sandbox.prizeBadgeHtml({ kind: 'badge', badgeStyle: badge }));
        try { assertLoading(dom.window.document.querySelector('[data-badge-icon]'), 'high'); }
        finally { dom.window.close(); }
    });

    it('sets loading state and priority before starting a lottery-editor icon request', () => {
        const source = fs.readFileSync(path.join(root, 'packages/ui-default/templates/manage_lottery.html'), 'utf8');
        const start = source.indexOf('    if (badge.iconUrl &&');
        const block = source.slice(start, source.indexOf('    preview.appendChild(pill);', start));
        assert.ok(block.indexOf("pill.dataset.badgeIconState = 'loading'") < block.indexOf('icon.src = badge.iconUrl'));
        assert.ok(block.indexOf("icon.setAttribute('fetchpriority', 'high')") < block.indexOf('icon.src = badge.iconUrl'));
        assert.match(block, /icon.loading = 'eager'/);
        assert.match(block, /label.setAttribute\('aria-hidden', 'true'\)/);
    });
});
