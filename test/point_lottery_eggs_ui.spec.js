const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');

// Exercise the real inline template script. This supplements, rather than replaces,
// browser verification of layout, animations, focus, and actual prize delivery.
const template = fs.readFileSync(path.join(__dirname, '../packages/ui-default/templates/main.html'), 'utf8');
const modalStart = template.indexOf('  <div class="point-lottery"');
const modalEnd = template.indexOf('  </div>', template.indexOf('    </section>', modalStart)) + '  </div>'.length;
const modalHtml = template.slice(modalStart, modalEnd).replace(/\{\{[\s\S]*?\}\}/g, '');
const scriptStart = template.indexOf('(function () {\n  var pointLottery =');
const script = template.slice(scriptStart, template.indexOf('</script>', scriptStart));

const badge = (hours, overrides = {}) => ({
    name: '嫦娥奔月', image: '/moon.png', probability: 10, pointDelta: 0,
    kind: 'badge', badgeId: 7, badgeDurationHours: hours, available: true, ...overrides,
});

function fixture(overrides = {}) {
    const state = {
        enabled: true, canDraw: true, cost: 10, points: 100, totalPoints: 100,
        prizes: [badge(24), badge(72)], recentWins: [], announcements: [], ...overrides,
    };
    const dom = new JSDOM(`<!doctype html><html><body><button data-point-lottery-open>打开抽奖</button>${modalHtml}</body></html>`,
        { runScripts: 'outside-only', url: 'http://localhost/' });
    const { window } = dom;
    const requests = [];
    window.matchMedia = () => ({ matches: true });
    window.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    let source = script
        .replace('{{ pointLottery|json|safe }}', JSON.stringify(state))
        .replace("{{ url('point_lottery_draw')|json|safe }}", JSON.stringify('/point-lottery/draw'));
    const close = source.lastIndexOf('}());');
    source = `${source.slice(0, close)}\nwindow.lotteryTest = { durationLabel, probabilityLabel, prizeProbability };\n${source.slice(close)}`;
    window.eval(source);
    const get = (selector) => window.document.querySelector(selector);
    return {
        window, requests, helpers: window.lotteryTest,
        get,
        eggs: Array.from(window.document.querySelectorAll('[data-point-lottery-egg]')),
        open: () => get('[data-point-lottery-open]').click(),
        close: () => get('.point-lottery__close').click(),
        finish(data) { requests.at(-1).resolve({ ok: true, json: async () => data }); },
        dispose: () => window.close(),
    };
}

async function eventually(predicate) {
    for (let attempt = 0; attempt < 30; attempt++) {
        if (predicate()) return;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(predicate(), 'UI did not reach the expected settled state');
}

describe('golden egg lottery inline UI', () => {
    it('formats badge durations in days without mislabelling permanent or ordinary prizes', () => {
        const ui = fixture();
        try {
            assert.equal(ui.helpers.durationLabel(badge(24)), '1 天');
            assert.equal(ui.helpers.durationLabel(badge(72)), '3 天');
            assert.equal(ui.helpers.durationLabel(badge(36)), '1.5 天');
            assert.equal(ui.helpers.durationLabel(badge(1)), '约0.04 天');
            assert.equal(ui.helpers.durationLabel(badge(0)), '永久');
            assert.equal(ui.helpers.durationLabel({ kind: 'normal' }), '');
            assert.equal(ui.helpers.durationLabel({ kind: 'badge' }), '');
        } finally { ui.dispose(); }
    });

    it('normalizes displayed odds over available weights, preserving tiny non-zero odds', () => {
        const prizes = [badge(24, { probability: 90, available: false }), badge(72, { probability: 30 }), badge(0, { probability: 70 })];
        const ui = fixture({ prizes });
        try {
            assert.equal(ui.helpers.probabilityLabel(prizes[0]), '0%');
            assert.equal(ui.helpers.probabilityLabel(prizes[1]), '30%');
            assert.equal(ui.helpers.probabilityLabel(prizes[2]), '70%');
            assert.equal(ui.helpers.probabilityLabel({ probability: 0.000001 }), '<0.01%');
        } finally { ui.dispose(); }
    });

    it('keeps identical badge names separately selectable with their own duration and probability', () => {
        const ui = fixture({ prizes: [badge(24, { probability: 1 }), badge(72, { probability: 3 })] });
        try {
            const cards = ui.window.document.querySelectorAll('[data-point-lottery-prize-index]');
            assert.equal(cards.length, 2);
            assert.match(cards[0].textContent, /1 天 · 25%/);
            assert.match(cards[1].textContent, /3 天 · 75%/);
            cards[1].click();
            assert.match(ui.get('[data-point-lottery-preview-meta]').textContent, /3 天.*75%/);
            assert.equal(cards[1].getAttribute('aria-pressed'), 'true');
            assert.equal(cards[0].getAttribute('aria-pressed'), 'false');
        } finally { ui.dispose(); }
    });

    it('disables every egg for empty, exhausted, logged-out, and insufficient-point states', () => {
        for (const overrides of [{ prizes: [] }, { prizes: [badge(24, { available: false })] }, { canDraw: false }, { points: 9 }]) {
            const ui = fixture(overrides);
            try {
                ui.open();
                for (const egg of ui.eggs) egg.click();
                assert.equal(ui.requests.length, 0);
                assert.ok(ui.eggs.every((egg) => egg.disabled));
            } finally { ui.dispose(); }
        }
    });

    it('locks all three eggs against repeat clicks and keeps the lock across close and reopen', async () => {
        const ui = fixture();
        try {
            ui.open();
            ui.eggs[0].click();
            ui.eggs[1].click();
            assert.equal(ui.requests.length, 1);
            assert.ok(ui.eggs.every((egg) => egg.disabled));
            ui.close();
            ui.open();
            ui.eggs[2].click();
            assert.equal(ui.requests.length, 1);
            assert.equal(ui.get('[data-point-lottery-egg-stage]').getAttribute('aria-busy'), 'true');
            ui.finish({ prize: badge(72), prizeIndex: 1, points: 90, totalPoints: 100, prizes: [badge(24), badge(72)] });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.eggs[0].disabled);
            assert.equal(ui.get('[data-point-lottery-points]').textContent, '90');
            assert.match(ui.get('[data-point-lottery-preview-meta]').textContent, /3 天/);
            assert.match(ui.get('[data-point-lottery-result-points]').textContent, /抽中奖品：3 天/);
            assert.equal(ui.get('[data-point-lottery-prize-index="1"]').getAttribute('aria-pressed'), 'true');
            ui.get('[data-point-lottery-result-close]').click();
            ui.get('[data-point-lottery-win-index="0"]').click();
            assert.match(ui.get('[data-point-lottery-preview-meta]').textContent, /抽中奖品：3 天/);
        } finally { ui.dispose(); }
    });

    it('shows known historical prize durations without inventing a duration for legacy logs', () => {
        const ui = fixture({ recentWins: [badge(72), { name: '历史勋章', image: '', pointDelta: 0 }] });
        try {
            ui.open();
            ui.get('[data-point-lottery-win-index="0"]').click();
            assert.match(ui.get('[data-point-lottery-preview-meta]').textContent, /3 天/);
            ui.get('[data-point-lottery-win-index="1"]').click();
            assert.equal(ui.get('[data-point-lottery-preview-name]').textContent, '历史勋章');
            assert.equal(ui.get('[data-point-lottery-preview-meta]').textContent, '');
        } finally { ui.dispose(); }
    });

    it('retains an award completed while closed, and shows it on reopen without drawing again', async () => {
        const ui = fixture();
        try {
            ui.open();
            ui.eggs[1].click();
            ui.close();
            ui.finish({ prize: badge(24), prizeIndex: 0, points: 90, totalPoints: 100 });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.eggs[0].disabled);
            assert.equal(ui.get('[data-point-lottery]').hidden, true);
            ui.open();
            assert.equal(ui.get('[data-point-lottery-result]').hidden, false);
            assert.equal(ui.get('[data-point-lottery-result-title]').textContent, '嫦娥奔月');
            assert.equal(ui.requests.length, 1);
            ui.get('[data-point-lottery-result-close]').click();
            assert.equal(ui.get('[data-point-lottery-result]').hidden, true);
        } finally { ui.dispose(); }
    });

    it('recovers from rejected draws without changing points and permits a later retry', async () => {
        const ui = fixture();
        try {
            ui.open();
            ui.eggs[0].click();
            ui.requests[0].resolve({ ok: true, json: async () => ({ ok: false, error: { message: '测试失败' } }) });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.eggs[0].disabled);
            assert.equal(ui.get('[data-point-lottery-result-title]').textContent, '测试失败');
            assert.equal(ui.get('[data-point-lottery-points]').textContent, '100');
            ui.get('[data-point-lottery-result-close]').click();
            ui.eggs[2].click();
            assert.equal(ui.requests.length, 2);
            ui.requests[1].reject(new Error('网络错误'));
            await eventually(() => ui.get('[data-point-lottery-result-title]').textContent === '网络错误');
        } finally { ui.dispose(); }
    });

    it('uses refreshed availability after a win and stops drawing when the eligible pool is exhausted', async () => {
        const ui = fixture({ prizes: [badge(24)] });
        try {
            ui.open();
            ui.eggs[2].click();
            ui.finish({ prize: badge(24), prizeIndex: 0, points: 90, totalPoints: 100, prizes: [badge(24, { available: false })] });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden
                && ui.get('[data-point-lottery-egg-stage]').getAttribute('aria-busy') === 'false');
            assert.ok(ui.eggs.every((egg) => egg.disabled));
            assert.match(ui.get('[data-point-lottery-status]').textContent, /已全部抽完/);
            assert.match(ui.get('[data-point-lottery-prize-index="0"]').textContent, /0% · 已获得/);
        } finally { ui.dispose(); }
    });
});
