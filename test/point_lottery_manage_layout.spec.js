const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const jsesc = require('jsesc');
const nunjucks = require('nunjucks');

const source = fs.readFileSync(path.join(__dirname, '../packages/ui-default/templates/manage_lottery.html'), 'utf8');
class FixtureLoader extends nunjucks.Loader {
    getSource(name) {
        const templates = {
            'manage_lottery.html': source,
            'manage_base.html': '<!doctype html><html><body>{% block manage_content %}{% endblock %}</body></html>',
            'domain_base.html': '<!doctype html><html><body>{% block domain_content %}{% endblock %}</body></html>',
            'components/user.html': '{% macro render_inline(user) %}<span class="user-name">{{ user.displayName|default(user.uname) }}</span>{% endmacro %}',
        };
        return templates[name] ? { src: templates[name], path: name, noCache: true } : null;
    }
}
const env = new nunjucks.Environment(new FixtureLoader(), { autoescape: true });
env.addFilter('json', JSON.stringify);
env.addFilter('jsesc', (value) => jsesc(value, { isScriptContext: true }));

function fixture(overrides = {}, runScript = true) {
    const learner = { _id: 22, uname: 'learner', displayName: '测试学员' };
    const prizes = [
        { kind: 'normal', name: '练习本', image: '/notebook.png', probability: 3, pointDelta: 5, repeatable: true, broadcast: true },
        { kind: 'badge', badgeId: 7, name: '星光勋章', badgeDurationHours: 24, badgeRepeatEffect: 'upgrade', badgeUpgradeBadgeIds: [8], probability: 1, pointDelta: 0, repeatable: false, broadcast: false },
    ];
    const context = {
        _: (value) => value,
        url: () => '/manage/lottery',
        datetimeSpan: () => '<time>2026-09-09 10:00</time>',
        lotteryScopeTitle: '唐老师 · 所有域学员', lotteryScopeNote: '积分与奖品按当前管理范围配置。', lotteryRoute: 'manage_lottery',
        config: { enabled: true, cost: 10, prizes }, prizeSlots: prizes,
        lotteryBadges: [
            { _id: 7, short: '星光', title: '星光勋章', image: '' },
            { _id: 8, short: '晨星', title: '晨星勋章', image: '' },
        ],
        rankBy: 'total', q: '', target: learner, targetPoints: 75, targetTotalPoints: 100, canAddTarget: true,
        pointRankRows: [{ rank: 1, udoc: learner, totalPoints: 100, currentPoints: 75 }],
        canEditDrawPrize: true,
        logRows: [
            { drawId: 'normal-draw', udoc: learner, prize: prizes[0], cost: 10, pointDelta: 5, points: 75 },
            { drawId: 'badge-draw', udoc: learner, prize: prizes[1], cost: 10, pointDelta: 0, points: 65 },
        ],
        ...overrides,
    };
    const dom = new JSDOM(env.render('manage_lottery.html', context), { runScripts: 'outside-only', url: 'https://example.test/manage/lottery' });
    if (runScript) dom.window.eval(dom.window.document.querySelector('script').textContent);
    const doc = dom.window.document;
    return {
        dom, doc,
        form: doc.getElementById('lottery-config-form'),
        rows: () => [...doc.querySelectorAll('[data-lottery-prizes] [data-lottery-prize]')],
        panels: () => [...doc.querySelectorAll('[data-lottery-panel]')],
        tab: (name) => doc.querySelector(`[data-lottery-view="${name}"]`),
        close: () => dom.window.close(),
    };
}

describe('lottery management page organization', () => {
    for (const base of ['manage_base.html', 'domain_base.html']) {
        it(`renders all operations once in ${base} with working form-associated save controls`, (t) => {
            const h = fixture({ lotteryBaseTemplate: base });
            t.after(h.close);
            assert.equal(h.doc.querySelectorAll('[data-lottery-admin]').length, 1);
            assert.equal(h.panels().length, 3);
            assert.equal(h.doc.querySelector('[data-lottery-settings-action]').form, h.form);
            assert.equal(h.form.enctype, 'multipart/form-data');
            const operations = [...h.doc.querySelectorAll('input[name="operation"]')].map((input) => input.value);
            assert.deepEqual(operations.sort(), ['add_points', 'clear_draws', 'deduct_points', 'delete_draw', 'delete_draw', 'edit_draw_prize', 'save_config'].sort());
            assert.equal(h.doc.querySelectorAll('form form').length, 0);
            assert.equal(h.doc.querySelectorAll('.lottery-admin__table-scroll > table').length, 3);
        });
    }

    it('switches accessible panels by click and keyboard without changing any saved configuration fields', (t) => {
        const h = fixture();
        t.after(h.close);
        const snapshot = () => [...new h.dom.window.FormData(h.form).entries()].filter(([, value]) => typeof value === 'string');
        const before = snapshot();
        assert.equal(h.tab('settings').getAttribute('aria-selected'), 'true');
        assert.deepEqual(h.panels().filter((panel) => !panel.hidden).map((panel) => panel.id), ['lottery-settings']);
        h.tab('points').click();
        assert.equal(h.doc.getElementById('lottery-points').hidden, false);
        assert.equal(h.doc.querySelector('[data-lottery-settings-action]').hidden, true);
        h.tab('points').dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        assert.equal(h.doc.activeElement, h.tab('records'));
        assert.equal(h.tab('records').tabIndex, 0);
        assert.equal(h.tab('settings').tabIndex, -1);
        assert.equal(h.dom.window.location.hash, '#lottery-records');
        assert.deepEqual(snapshot(), before);
    });

    it('starts searches and record mutations in their relevant panels and keeps success messages visible', () => {
        for (const [context, expected] of [[{ q: 'learner' }, 'points'], [{ adjusted: true }, 'points'], [{ edited: true }, 'records'], [{ deleted: true }, 'records'], [{ saved: true }, 'settings']]) {
            const h = fixture(context);
            try {
                assert.equal(h.tab(expected).getAttribute('aria-selected'), 'true');
                if (context.edited || context.deleted) assert.equal(h.doc.querySelector('.lottery-admin__success').closest('[data-lottery-panel]'), null);
            } finally { h.close(); }
        }
    });

    it('preserves all prize values through collapsing, opens invalid fields, and renumbers added and removed prizes', (t) => {
        const h = fixture();
        t.after(h.close);
        assert.equal(h.rows()[0].open, true);
        assert.equal(h.rows()[1].open, false);
        h.doc.querySelector('[data-lottery-expand]').click();
        assert.ok(h.rows().every((row) => row.open));
        h.doc.querySelector('[data-lottery-expand]').click();
        assert.ok(h.rows().every((row) => !row.open));
        h.tab('records').click();
        h.rows()[1].querySelector('[data-lottery-badge-id]').dispatchEvent(new h.dom.window.Event('invalid', { cancelable: true }));
        assert.equal(h.tab('settings').getAttribute('aria-selected'), 'true');
        assert.equal(h.rows()[1].open, true);
        const before = new h.dom.window.FormData(h.form);
        assert.equal(before.get('prize0Name'), '练习本');
        assert.equal(before.get('prize0Probability'), '3');
        assert.equal(before.get('prize1BadgeId'), '7');
        assert.equal(before.get('prize1BadgeDurationHours'), '24');
        assert.equal(before.get('prize1BadgeRepeatEffect'), 'upgrade');
        assert.deepEqual(JSON.parse(before.get('prize1BadgeUpgradeBadgeIds')), ['8']);
        h.doc.querySelectorAll('[data-lottery-add]')[1].click();
        const added = h.rows()[2];
        assert.equal(added.open, true);
        const name = added.querySelector('[data-field="Name"]');
        name.value = '新奖品';
        name.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }));
        assert.equal(added.querySelector('[data-lottery-prize-name]').textContent, '新奖品');
        h.rows()[0].querySelector('[data-lottery-remove]').click();
        assert.equal(h.doc.querySelector('[data-lottery-prize-total]').textContent, '2');
        assert.equal(h.form.querySelector('[name="prizeCount"]').value, '2');
        assert.equal(added.querySelector('[data-field="Name"]').name, 'prize1Name');
        assert.equal(h.rows()[0].querySelector('[data-lottery-upgrade-item] select').name, 'prize0BadgeUpgradeBadgeId0');
    });

    it('retains prize record editing, cancellation focus, deletion fields and clear confirmation', (t) => {
        const h = fixture({ edited: true });
        t.after(h.close);
        const toggle = h.doc.querySelector('[data-lottery-edit-toggle]');
        assert.equal(h.doc.querySelectorAll('[data-lottery-edit-toggle]').length, 1, 'Badge prizes must not get a replacement operation');
        toggle.click();
        const row = h.doc.getElementById(toggle.getAttribute('aria-controls'));
        assert.equal(row.hidden, false);
        assert.equal(h.doc.activeElement, row.querySelector('select'));
        assert.equal(row.querySelector('[name="operation"]').value, 'edit_draw_prize');
        assert.equal(row.querySelector('[name="drawId"]').value, 'normal-draw');
        row.querySelector('[data-lottery-edit-cancel]').click();
        assert.equal(row.hidden, true);
        assert.equal(h.doc.activeElement, toggle);
        const clearForm = h.doc.querySelector('[name="operation"][value="clear_draws"]').form;
        assert.match(clearForm.getAttribute('onsubmit'), /return confirm/);
    });

    it('keeps every section usable without JavaScript and renders helpful empty states', (t) => {
        const h = fixture({ target: null, pointRankRows: [], logRows: [] }, false);
        t.after(h.close);
        assert.ok(h.panels().every((panel) => !panel.hidden));
        assert.equal(h.doc.querySelector('[data-lottery-tabs]').hidden, true);
        assert.match(h.doc.querySelector('#lottery-points').textContent, /暂无积分数据/);
        assert.match(h.doc.querySelector('#lottery-records').textContent, /暂无抽奖记录/);
    });
});
