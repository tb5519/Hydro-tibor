const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const jsesc = require('jsesc');
const nunjucks = require('nunjucks');

const template = fs.readFileSync(path.join(__dirname, '../packages/ui-default/templates/manage_lottery.html'), 'utf8');
const formStart = template.indexOf('<form method="post" enctype="multipart/form-data"');
const form = template.slice(formStart, template.indexOf('</form>', formStart) + '</form>'.length);
const script = template.match(/<script>([\s\S]*?)<\/script>/)[1];
const env = new nunjucks.Environment(null, { autoescape: true });
env.addFilter('json', JSON.stringify);
env.addFilter('jsesc', (value) => jsesc(value, { isScriptContext: true }));
env.addGlobal('_', (value) => value);

function fixture() {
    const lotteryBadges = [
        { _id: 7, short: '☾ 嫦娥奔月', title: '月光勋章', backgroundColor: '48348b', fontColor: 'ffe6a3', image: '/badge/7/ac?size=384' },
        { _id: 8, short: '✦ 星际探索家', title: '探索勋章', backgroundColor: '145f74', fontColor: 'ffffff', image: '/badge/8/ac?size=384' },
        { _id: 9, short: '无图勋章', title: '暂无 AC 图', backgroundColor: '264477', fontColor: 'ffffff', image: '' },
    ];
    const prizeSlots = [
        {
            kind: 'badge', badgeId: 7, badgeDurationHours: 24, badgeRepeatEffect: 'duration', badgeUpgradeBadgeIds: [],
            name: '嫦娥奔月', image: '/old-independent-upload.png', probability: 10, pointDelta: 0,
        },
        { kind: 'normal', name: '普通奖品', image: '/ordinary.png', probability: 10, pointDelta: 0 },
    ];
    const html = env.renderString(`${form}<script data-manage-script>${script}</script>`, {
        config: { enabled: true, cost: 10 }, prizeSlots, lotteryBadges,
    });
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
    dom.window.eval(dom.window.document.querySelector('[data-manage-script]').textContent);
    const rows = () => Array.from(dom.window.document.querySelectorAll('[data-lottery-prizes] [data-lottery-prize]'));
    const change = (input, value) => {
        input.value = value;
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    };
    return { window: dom.window, rows, change, dispose: () => dom.window.close() };
}

describe('point lottery automatic badge AC image management', () => {
    it('hides and disables badge prize uploads while retaining normal prize uploads and old stored references', () => {
        const ui = fixture();
        try {
            const [badge, normal] = ui.rows();
            assert.equal(badge.querySelector('[data-lottery-prize-image-field]').hidden, true);
            assert.equal(badge.querySelector('[data-lottery-image-file]').disabled, true);
            assert.equal(badge.querySelector('[data-lottery-image-value]').value, '/old-independent-upload.png');
            assert.equal(badge.querySelector('[data-lottery-image-preview]').style.backgroundImage, '');
            assert.equal(badge.querySelector('[data-lottery-badge-image-preview] img').getAttribute('src'), '/badge/7/ac?size=384');
            assert.equal(normal.querySelector('[data-lottery-prize-image-field]').hidden, false);
            assert.equal(normal.querySelector('[data-lottery-image-file]').disabled, false);
            assert.equal(normal.querySelector('[data-lottery-image-value]').value, '/ordinary.png');
            assert.equal(normal.querySelector('[data-lottery-badge-image-preview] img'), null);
        } finally { ui.dispose(); }
    });

    it('updates the automatic preview on badge selection and retains the badge pill for missing or broken images', () => {
        const ui = fixture();
        try {
            const row = ui.rows()[0];
            const preview = row.querySelector('[data-lottery-badge-image-preview]');
            const oldImage = preview.querySelector('img');
            ui.change(row.querySelector('[data-lottery-badge-id]'), '8');
            const image = preview.querySelector('img');
            assert.equal(image.getAttribute('src'), '/badge/8/ac?size=384');
            assert.equal(image.decoding, 'async');
            oldImage.dispatchEvent(new ui.window.Event('load'));
            assert.equal(preview.querySelector('img'), image);
            image.dispatchEvent(new ui.window.Event('error'));
            assert.equal(preview.querySelector('img'), null);
            assert.equal(preview.querySelector('.user-profile-badge').textContent, '✦ 星际探索家');
            ui.change(row.querySelector('[data-lottery-badge-id]'), '9');
            assert.equal(preview.querySelector('img'), null);
            assert.equal(preview.querySelector('.user-profile-badge').textContent, '无图勋章');
        } finally { ui.dispose(); }
    });

    it('supports a newly added badge prize without an upload and preserves all upgrade states on form submission', () => {
        const ui = fixture();
        try {
            ui.window.document.querySelector('[data-lottery-add]').click();
            const row = ui.rows().at(-1);
            ui.change(row.querySelector('[data-lottery-kind]'), 'badge');
            ui.change(row.querySelector('[data-lottery-badge-id]'), '7');
            assert.equal(row.querySelector('[data-lottery-image-file]').disabled, true);
            assert.equal(row.querySelector('[data-lottery-badge-image-preview] img').getAttribute('src'), '/badge/7/ac?size=384');
            ui.change(row.querySelector('[data-lottery-badge-repeat-effect]'), 'upgrade');
            row.querySelector('[data-lottery-upgrade-add]').click();
            row.querySelector('[data-lottery-upgrade-add]').click();
            const states = row.querySelectorAll('[data-lottery-upgrade-item] select');
            states[0].value = '8';
            states[1].value = '9';
            row.closest('form').dispatchEvent(new ui.window.Event('submit', { cancelable: true }));
            assert.deepEqual(JSON.parse(row.querySelector('[data-lottery-upgrade-values]').value), ['8', '9']);
            assert.equal(states[1].name, 'prize2BadgeUpgradeBadgeId1');
        } finally { ui.dispose(); }
    });

    it('restores the ordinary upload when switching type and prevents stale badge loads from returning', () => {
        const ui = fixture();
        try {
            const row = ui.rows()[0];
            const image = row.querySelector('[data-lottery-badge-image-preview] img');
            ui.change(row.querySelector('[data-lottery-kind]'), 'normal');
            image.dispatchEvent(new ui.window.Event('load'));
            assert.equal(row.querySelector('[data-lottery-badge-preview-field]').hidden, true);
            assert.equal(row.querySelector('[data-lottery-badge-image-preview] img'), null);
            assert.equal(row.querySelector('[data-lottery-image-file]').disabled, false);
            assert.equal(row.querySelector('[data-lottery-image-value]').value, '/old-independent-upload.png');
        } finally { ui.dispose(); }
    });
});
