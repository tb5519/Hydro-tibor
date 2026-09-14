const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const jsesc = require('jsesc');
const nunjucks = require('nunjucks');

// Exercise the real inline template script. This supplements, rather than replaces,
// browser verification of layout, animations, focus, and actual prize delivery.
const template = fs.readFileSync(path.join(__dirname, '../packages/ui-default/templates/main.html'), 'utf8');
const modalStart = template.indexOf('  <div class="point-lottery"');
const modalEnd = template.indexOf('  </div>', template.indexOf('    </section>', modalStart)) + '  </div>'.length;
const modalHtml = template.slice(modalStart, modalEnd).replace(/\{\{[\s\S]*?\}\}/g, '');
const scriptStart = template.indexOf('(function () {\n  var pointLottery =');
const script = template.slice(scriptStart, template.indexOf('</script>', scriptStart));
const templateEnv = new nunjucks.Environment(null, { autoescape: true });
templateEnv.addFilter('json', JSON.stringify);
templateEnv.addFilter('jsesc', (value) => jsesc(value, { isScriptContext: true }));
templateEnv.addGlobal('url', () => '/point-lottery/draw');

const badge = (hours, overrides = {}) => ({
    name: '嫦娥奔月', image: '/moon.png', probability: 10, pointDelta: 0,
    kind: 'badge', badgeId: 7, badgeDurationHours: hours, available: true, ...overrides,
});
const badgeStyles = {
    7: { id: 7, displayName: '☾ 月光小勇士', backgroundColor: '#48348b', fontColor: '#ffe6a3', tooltip: '坚持学习获得的嫦娥奔月勋章' },
};
// A real 1 x 1 RGBA PNG with transparent pixels: the UI must preserve its source.
const fixedNow = '2026-09-14T02:00:00.000Z';
const fiveDaysLater = '2026-09-19T02:00:00.000Z';

const transparentSquarePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

function fixture(overrides = {}, now = fixedNow) {
    const state = {
        enabled: true, canDraw: true, cost: 10, points: 100, totalPoints: 100,
        prizes: [badge(24), badge(72)], recentWins: [], announcements: [], badgeStyles, ...overrides,
    };
    let source = templateEnv.renderString(script, { pointLottery: state });
    const close = source.lastIndexOf('}());');
    source = `${source.slice(0, close)}\nwindow.lotteryTest = { durationLabel, probabilityLabel, prizeProbability };\n${source.slice(close)}`;
    // Parse the actual HTML script boundary before execution, so a regression in
    // script-context escaping cannot hide behind direct eval of a JS string.
    const html = '<!doctype html><html><body><nav style="position:fixed;z-index:500">导航</nav>'
        + '<div class="slideout-panel" style="position:relative;z-index:1"><main class="ui-v2-home" data-fixture-parent>'
        + '<header data-fixture-before><button data-point-lottery-open>打开抽奖</button></header>'
        + `${modalHtml}<section data-fixture-after>首页其他内容</section></main></div>`
        + `<script data-lottery-script>${source}</script></body></html>`;
    const dom = new JSDOM(html,
        { runScripts: 'outside-only', url: 'http://localhost/' });
    const { window } = dom;
    const NativeDate = window.Date;
    let clock = NativeDate.parse(now);
    window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [clock])); }
        static now() { return clock; }
    };
    const requests = [];
    window.matchMedia = () => ({ matches: true });
    window.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    window.eval(window.document.querySelector('[data-lottery-script]').textContent);
    const get = (selector) => window.document.querySelector(selector);
    return {
        window, requests, helpers: window.lotteryTest,
        get,
        setNow: (value) => { clock = NativeDate.parse(value); },
        chests: Array.from(window.document.querySelectorAll('[data-point-lottery-chest]')),
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

describe('treasure chest lottery inline UI', () => {
    it('formats badge durations in readable day, hour, and minute units without mislabelling permanent prizes', () => {
        const ui = fixture();
        try {
            assert.equal(ui.helpers.durationLabel(badge(24)), '1 天');
            assert.equal(ui.helpers.durationLabel(badge(72)), '3 天');
            assert.equal(ui.helpers.durationLabel(badge(36)), '1 天 12 小时');
            assert.equal(ui.helpers.durationLabel(badge(1)), '1 小时');
            assert.equal(ui.helpers.durationLabel(badge(0.5)), '30 分钟');
            assert.equal(ui.helpers.durationLabel(badge(1 / 60)), '1 分钟');
            assert.equal(ui.helpers.durationLabel(badge(0)), '永久');
            assert.equal(ui.helpers.durationLabel({ kind: 'normal' }), '');
            assert.equal(ui.helpers.durationLabel({ kind: 'badge' }), '');
        } finally { ui.dispose(); }
    });

    it('prominently separates the awarded duration from cumulative remaining time and China expiry', async () => {
        const prize = badge(72, { badgeValidity: { status: 'active', expiresAt: fiveDaysLater } });
        const ui = fixture();
        try {
            ui.open();
            ui.chests[0].click();
            ui.finish({ prize, prizeIndex: 1, points: 90, totalPoints: 100 });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            const validity = ui.get('[data-point-lottery-result-validity]');
            assert.equal(validity.hidden, false);
            assert.match(validity.textContent.replace(/\s/g, ''), /本次获得3天/);
            assert.match(validity.textContent.replace(/\s/g, ''), /当前剩余5天/);
            assert.match(validity.textContent, /有效至\s*2026-09-19 10:00/);
            assert.match(validity.textContent, /北京时间/);
            assert.equal(ui.get('[data-point-lottery-result-points]').textContent, '当前积分：90');
            assert.equal(ui.window.document.activeElement, ui.get('[data-point-lottery-result-close]'));
        } finally { ui.dispose(); }
    });

    it('uses current permanent ownership without confusing it with a finite awarded duration', async () => {
        const prize = badge(72, { badgeValidity: { status: 'permanent' } });
        const ui = fixture();
        try {
            ui.open();
            ui.chests[0].click();
            ui.finish({ prize, prizeIndex: 1, points: 90, totalPoints: 100 });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            const validity = ui.get('[data-point-lottery-result-validity]');
            assert.equal(validity.hidden, false);
            assert.match(validity.textContent.replace(/\s/g, ''), /本次获得3天/);
            assert.match(validity.textContent.replace(/\s/g, ''), /当前拥有永久有效/);
            assert.doesNotMatch(validity.textContent, /有效至|当前剩余/);
        } finally { ui.dispose(); }
    });

    it('uses the server clock for live remaining time when the student device clock is wrong', async () => {
        const prize = badge(72, { badgeValidity: { status: 'active', expiresAt: fiveDaysLater } });
        const ui = fixture({ recentWins: [prize], serverNow: fixedNow }, '2027-01-01T02:00:00.000Z');
        try {
            ui.open();
            ui.get('[data-point-lottery-win-index="0"]').click();
            assert.match(ui.get('[data-point-lottery-preview-meta]').textContent.replace(/\s/g, ''), /当前剩余5天/);
            ui.chests[0].click();
            ui.finish({ prize, prizeIndex: 1, points: 90, serverNow: '2026-09-15T02:00:00.000Z' });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            const text = ui.get('[data-point-lottery-result-validity]').textContent;
            assert.match(text.replace(/\s/g, ''), /当前剩余4天/);
            assert.match(text, /有效至\s*2026-09-19 10:00/);
            assert.doesNotMatch(text, /已到期/);
        } finally { ui.dispose(); }
    });

    it('describes an upgrade without claiming that the configured duration was added again', async () => {
        const prize = badge(72, {
            awardedBadgeId: 8, badgeAwardAction: 'upgraded', badgeDurationAddedHours: 0,
            badgeValidity: { status: 'active', expiresAt: '2026-09-16T02:00:00.000Z' },
        });
        const ui = fixture();
        try {
            ui.open();
            ui.chests[0].click();
            ui.finish({ prize, prizeIndex: 1, points: 90 });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            const text = ui.get('[data-point-lottery-result-validity]').textContent.replace(/\s/g, '');
            assert.match(text, /本次效果有效期不变/);
            assert.match(text, /当前剩余2天/);
            assert.doesNotMatch(text, /本次获得3天/);
        } finally { ui.dispose(); }
    });

    it('labels a finite prize as configured duration when a permanent owner receives no extra hours', async () => {
        const prize = badge(72, {
            badgeAwardAction: 'extended', badgeDurationAddedHours: 0,
            badgeValidity: { status: 'permanent' },
        });
        const ui = fixture();
        try {
            ui.open();
            ui.chests[0].click();
            ui.finish({ prize, prizeIndex: 1, points: 90 });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            const text = ui.get('[data-point-lottery-result-validity]').textContent.replace(/\s/g, '');
            assert.match(text, /本次奖品3天/);
            assert.match(text, /当前拥有永久有效/);
            assert.doesNotMatch(text, /本次获得3天|当前剩余/);
        } finally { ui.dispose(); }
    });

    it('still shows newly granted days for a first award from an upgrade prize', async () => {
        const prize = badge(72, {
            badgeRepeatEffect: 'upgrade', badgeAwardAction: 'granted', badgeDurationAddedHours: 72,
            badgeValidity: { status: 'active', expiresAt: '2026-09-17T02:00:00.000Z' },
        });
        const ui = fixture();
        try {
            ui.open();
            ui.chests[0].click();
            ui.finish({ prize, prizeIndex: 1, points: 90 });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            const text = ui.get('[data-point-lottery-result-validity]').textContent.replace(/\s/g, '');
            assert.match(text, /本次获得3天/);
            assert.match(text, /当前剩余3天/);
            assert.doesNotMatch(text, /有效期不变|本次奖品/);
        } finally { ui.dispose(); }
    });

    it('shows short remaining time in hours and minutes instead of tiny fractional days', async () => {
        for (const [expiresAt, label] of [
            ['2026-09-14T03:00:00.000Z', '1小时'],
            ['2026-09-14T02:30:00.000Z', '30分钟'],
            ['2026-09-14T02:00:30.000Z', '不足1分钟'],
        ]) {
            const ui = fixture();
            try {
                ui.open();
                ui.chests[0].click();
                ui.finish({ prize: badge(1, { badgeValidity: { status: 'active', expiresAt } }), prizeIndex: 0, points: 90 });
                // eslint-disable-next-line no-await-in-loop
                await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
                const text = ui.get('[data-point-lottery-result-validity]').textContent.replace(/\s/g, '');
                assert.ok(text.includes(`当前剩余${label}`), text);
                assert.doesNotMatch(text, /0\.0\d天/);
            } finally { ui.dispose(); }
        }
    });

    it('treats an expiry at or before the current time as expired even if the payload says active', async () => {
        for (const expiresAt of [fixedNow, '2026-09-14T01:59:59.000Z']) {
            const ui = fixture();
            try {
                ui.open();
                ui.chests[0].click();
                ui.finish({ prize: badge(72, { badgeValidity: { status: 'active', expiresAt } }), prizeIndex: 0, points: 90 });
                // eslint-disable-next-line no-await-in-loop
                await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
                const text = ui.get('[data-point-lottery-result-validity]').textContent;
                assert.match(text, /已到期/);
                assert.doesNotMatch(text, /永久有效|当前剩余/);
            } finally { ui.dispose(); }
        }
    });

    it('never invents permanent ownership for unknown or malformed validity metadata', async () => {
        for (const badgeValidity of [undefined, { status: 'unknown' }, { status: 'active' },
            { status: 'active', expiresAt: 'not-a-date' }, { status: 'active', expiresAt: '' }]) {
            const ui = fixture();
            try {
                ui.open();
                ui.chests[0].click();
                ui.finish({ prize: badge(72, { badgeValidity }), prizeIndex: 0, points: 90 });
                // eslint-disable-next-line no-await-in-loop
                await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
                const text = ui.get('[data-point-lottery-result-validity]').textContent;
                assert.match(text.replace(/\s/g, ''), /本次获得3天/);
                assert.match(text, /暂无法确认/);
                assert.doesNotMatch(text, /永久有效|有效至|Invalid Date|NaN/);
            } finally { ui.dispose(); }
        }
    });

    it('keeps the pool preview about the configured award while history shows live validity', () => {
        const prize = badge(72, { badgeValidity: { status: 'active', expiresAt: fiveDaysLater } });
        const ui = fixture({ prizes: [prize], recentWins: [prize] });
        try {
            ui.open();
            const meta = ui.get('[data-point-lottery-preview-meta]');
            assert.match(meta.textContent, /3 天/);
            assert.doesNotMatch(meta.textContent, /当前剩余|有效至|5 天/);
            ui.get('[data-point-lottery-win-index="0"]').click();
            assert.match(meta.textContent.replace(/\s/g, ''), /本次获得3天/);
            assert.match(meta.textContent.replace(/\s/g, ''), /当前剩余5天/);
            assert.match(meta.textContent, /有效至\s*2026-09-19 10:00/);
            ui.setNow('2026-09-20T02:00:00.000Z');
            ui.get('[data-point-lottery-win-index="0"]').click();
            assert.match(meta.textContent, /已到期/);
            assert.doesNotMatch(meta.textContent, /当前剩余|永久有效/);
            ui.get('[data-point-lottery-prize-index="0"]').click();
            assert.doesNotMatch(meta.textContent, /已到期|当前剩余|有效至/);
        } finally { ui.dispose(); }
    });

    it('replaces prior validity after repeated draws and clears it completely for ordinary rewards and failures', async () => {
        const ui = fixture({ prizes: [badge(72), { kind: 'normal', name: '学习积分', pointDelta: 5, probability: 1 }] });
        try {
            ui.open();
            const responses = [
                { prize: badge(72, { badgeValidity: { status: 'active', expiresAt: fiveDaysLater } }), prizeIndex: 0, points: 90 },
                { prize: badge(24, { badgeValidity: { status: 'permanent' } }), prizeIndex: 0, points: 80 },
                { prize: { kind: 'normal', name: '学习积分', pointDelta: 5, badgeValidity: { status: 'permanent' } }, prizeIndex: 1, points: 75 },
                { error: { message: '测试失败' } },
            ];
            for (const [index, response] of responses.entries()) {
                ui.chests[0].click();
                ui.finish(response);
                // eslint-disable-next-line no-await-in-loop
                await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
                const validity = ui.get('[data-point-lottery-result-validity]');
                if (index === 0) assert.match(validity.textContent, /2026-09-19/);
                else if (index === 1) {
                    assert.match(validity.textContent.replace(/\s/g, ''), /本次获得1天/);
                    assert.match(validity.textContent, /永久有效/);
                    assert.doesNotMatch(validity.textContent, /2026-09-19|5 天|3 天/);
                } else {
                    assert.equal(validity.hidden, true);
                    assert.equal(validity.textContent, '');
                }
                ui.get('[data-point-lottery-result-close]').click();
            }
            assert.equal(ui.get('[data-point-lottery-points]').textContent, '75');
        } finally { ui.dispose(); }
    });

    it('refreshes prior wins from the actual awarded badge validity map after another draw', async () => {
        const original = badge(72, {
            awardedBadgeId: 8, sourceBadgeId: 7,
            badgeValidity: { status: 'active', expiresAt: '2026-09-16T02:00:00.000Z' },
        });
        const ui = fixture({ recentWins: [original] });
        try {
            ui.open();
            ui.get('[data-point-lottery-win-index="0"]').click();
            assert.match(ui.get('[data-point-lottery-preview-meta]').textContent.replace(/\s/g, ''), /当前剩余2天/);
            ui.chests[0].click();
            ui.finish({
                prize: badge(24, { badgeId: 9, badgeValidity: { status: 'unknown' } }), prizeIndex: 0, points: 90,
                badgeValidities: {
                    7: { status: 'permanent' },
                    8: { status: 'active', expiresAt: fiveDaysLater },
                    9: { status: 'permanent' },
                },
            });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            assert.match(ui.get('[data-point-lottery-result-validity]').textContent, /永久有效/);
            ui.get('[data-point-lottery-result-close]').click();
            ui.get('[data-point-lottery-win-index="1"]').click();
            const meta = ui.get('[data-point-lottery-preview-meta]').textContent;
            assert.match(meta.replace(/\s/g, ''), /本次获得3天/);
            assert.match(meta.replace(/\s/g, ''), /当前剩余5天/);
            assert.match(meta, /有效至\s*2026-09-19 10:00/);
            assert.doesNotMatch(meta, /永久有效|2026-09-16/);
        } finally { ui.dispose(); }
    });

    it('does not interpret malformed expiry metadata as HTML or script content', async () => {
        const payload = '</script><img data-validity-injected src=x onerror="window.injected=true">';
        const ui = fixture({ recentWins: [badge(72, { badgeValidity: { status: 'active', expiresAt: payload } })] });
        try {
            ui.open();
            ui.get('[data-point-lottery-win-index="0"]').click();
            assert.equal(ui.get('[data-validity-injected]'), null);
            assert.equal(ui.window.injected, undefined);
            assert.match(ui.get('[data-point-lottery-preview-meta]').textContent, /暂无法确认/);
            ui.chests[0].click();
            ui.finish({ prize: badge(72, { badgeValidity: { status: 'active', expiresAt: payload } }), prizeIndex: 0, points: 90 });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            const validity = ui.get('[data-point-lottery-result-validity]');
            assert.match(validity.textContent, /暂无法确认/);
            assert.equal(validity.querySelector('img, script'), null);
            assert.equal(ui.get('[data-validity-injected]'), null);
            assert.equal(ui.window.injected, undefined);
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

    it('preserves the selected square transparent image through preview, actual winning index, result, and history', async () => {
        const prizes = [badge(24, { image: '/other-square.png' }), badge(24, { image: transparentSquarePng })];
        const ui = fixture({ prizes });
        try {
            ui.open();
            ui.get('[data-point-lottery-prize-index="1"]').click();
            assert.equal(ui.get('[data-point-lottery-preview-image] img').getAttribute('src'), transparentSquarePng);
            ui.chests[1].click();
            ui.finish({ prize: prizes[1], prizeIndex: 1, points: 90, totalPoints: 100, prizes });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            assert.equal(ui.get('[data-point-lottery-result-image] img').getAttribute('src'), transparentSquarePng);
            assert.equal(ui.get('[data-point-lottery-preview-image] img').getAttribute('src'), transparentSquarePng);
            assert.equal(ui.get('[data-point-lottery-prize-index="1"]').getAttribute('aria-pressed'), 'true');
            ui.get('[data-point-lottery-result-close]').click();
            ui.get('[data-point-lottery-win-index="0"]').click();
            assert.equal(ui.get('[data-point-lottery-preview-image] img').getAttribute('src'), transparentSquarePng);
        } finally { ui.dispose(); }
    });

    it('does not request hidden lottery or history images and opens immediately while only the selected image loads', () => {
        const ui = fixture({ prizes: [badge(24), badge(72, { image: '/second.png' })], recentWins: [badge(24, { image: '/history.png' })] });
        try {
            assert.equal(ui.window.document.querySelectorAll('[data-point-lottery] img').length, 0);
            ui.open();
            const image = ui.get('[data-point-lottery-preview-image] img');
            assert.equal(image.getAttribute('src'), '/moon.png');
            assert.equal(image.decoding, 'async');
            assert.equal(ui.window.document.querySelectorAll('[data-point-lottery] img').length, 1);
            assert.equal(ui.get('[data-point-lottery-wins] img'), null);
            assert.ok(ui.chests.every((chest) => !chest.disabled));
            assert.ok(ui.get('[data-point-lottery-preview-image] .point-lottery__badge'));
            image.dispatchEvent(new ui.window.Event('error'));
            assert.equal(ui.get('[data-point-lottery-preview-image] img'), null);
            assert.ok(ui.get('[data-point-lottery-preview-image] .point-lottery__badge'));
            assert.ok(ui.chests.every((chest) => !chest.disabled));
        } finally { ui.dispose(); }
    });

    it('ignores late image loads after selecting another prize or closing the modal', () => {
        const ui = fixture({ prizes: [badge(24), badge(72, { image: '/second.png' })] });
        try {
            ui.open();
            const first = ui.get('[data-point-lottery-preview-image] img');
            ui.get('[data-point-lottery-prize-index="1"]').click();
            const second = ui.get('[data-point-lottery-preview-image] img');
            assert.equal(first.getAttribute('src'), null);
            first.dispatchEvent(new ui.window.Event('load'));
            assert.equal(ui.get('[data-point-lottery-preview-image] img'), second);
            assert.equal(second.getAttribute('src'), '/second.png');
            second.dispatchEvent(new ui.window.Event('load'));
            assert.equal(ui.get('[data-point-lottery-preview-image] .point-lottery__badge'), null);
            assert.equal(second.style.display, '');
            ui.close();
            assert.equal(second.getAttribute('src'), null);
            second.dispatchEvent(new ui.window.Event('load'));
            assert.equal(ui.window.document.querySelectorAll('[data-point-lottery] img').length, 0);
        } finally { ui.dispose(); }
    });

    it('completes upgraded awards without waiting for images and keeps actual award image and style snapshots in history', async () => {
        const awardedStyle = { ...badgeStyles[7], id: 8, displayName: '✦ 星耀勇士', backgroundColor: '#145f74' };
        const prize = badge(72, {
            name: '✦ 星耀勇士', sourceBadgeId: 7, awardedBadgeId: 8, badgeLevel: 2,
            image: '/badge/8/ac-image?size=384', resultImage: '/badge/8/ac-image?size=768', badgeStyle: awardedStyle,
        });
        const ui = fixture();
        try {
            ui.open();
            ui.chests[0].click();
            ui.finish({ prize, prizeIndex: 1, points: 90, totalPoints: 100, prizes: [badge(24), badge(72)] });
            // No image load or decode completion is dispatched in this test.
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            assert.equal(ui.get('[data-point-lottery-result-title]').textContent, prize.name);
            assert.equal(ui.get('[data-point-lottery-result-image] img').getAttribute('src'), prize.resultImage);
            assert.equal(ui.get('[data-point-lottery-preview-image] img').getAttribute('src'), prize.image);
            assert.equal(ui.get('[data-point-lottery-result-image] .point-lottery__badge').textContent, awardedStyle.displayName);
            assert.equal(ui.get('[data-point-lottery-prize-index="1"]').getAttribute('aria-pressed'), 'true');
            ui.get('[data-point-lottery-result-image] img').dispatchEvent(new ui.window.Event('error'));
            assert.ok(ui.get('[data-point-lottery-result-image] .point-lottery__badge'));
            ui.get('[data-point-lottery-result-close]').click();
            ui.get('[data-point-lottery-win-index="0"]').click();
            assert.equal(ui.get('[data-point-lottery-preview-image] img').getAttribute('src'), prize.image);
            assert.equal(ui.get('[data-point-lottery-preview-image] .point-lottery__badge').textContent, awardedStyle.displayName);
            assert.equal(ui.get('[data-point-lottery-points]').textContent, '90');
        } finally { ui.dispose(); }
    });

    it('renders the configured ranking badge display name and colors from the top-level style catalog', () => {
        const ui = fixture({ prizes: [badge(24, { image: '' })] });
        try {
            ui.open();
            const pills = Array.from(ui.window.document.querySelectorAll('.point-lottery__badge'));
            assert.ok(pills.length > 0, 'Configured badge preview is missing');
            for (const pill of pills) {
                assert.equal(pill.textContent.trim(), badgeStyles[7].displayName);
                assert.match(pill.getAttribute('style'), /#48348b/i);
                assert.match(pill.getAttribute('style'), /#ffe6a3/i);
            }
        } finally { ui.dispose(); }
    });

    it('escapes configured badge text and tooltip and rejects non-hex style injection', () => {
        const displayName = '月光 <img src=x onerror="window.injected=true">';
        const tooltip = '\"><svg onload="window.injected=true">';
        const ui = fixture({
            prizes: [badge(24, { image: '' })],
            badgeStyles: {
                7: {
                    id: 7, displayName, tooltip,
                    backgroundColor: '#fff;background-image:url(//untrusted.example)', fontColor: 'red\" onmouseover=\"alert(1)',
                },
            },
        });
        try {
            ui.open();
            const pills = Array.from(ui.window.document.querySelectorAll('.point-lottery__badge'));
            assert.ok(pills.length > 0);
            for (const pill of pills) {
                assert.equal(pill.textContent, displayName);
                assert.equal(pill.getAttribute('title'), tooltip);
                assert.equal(pill.querySelector('img, svg, script'), null);
                assert.equal(pill.getAttribute('onmouseover'), null);
                assert.equal(pill.style.backgroundImage, '');
                assert.match(pill.getAttribute('style'), /background-color:#e5edf5;color:#1f2937/);
            }
            assert.equal(ui.window.injected, undefined);
        } finally { ui.dispose(); }
    });

    it('keeps script-closing badge metadata inside the escaped JSON script context', () => {
        const payload = '</script><script>window.injected=true</script><img id="injected-node" src="x">';
        const displayName = `月光 '${payload} \\ 小勇士`;
        const tooltip = `备注 ${payload}`;
        const ui = fixture({
            prizes: [badge(72, { image: '', name: `奖品 ${payload}` })],
            badgeStyles: { 7: { ...badgeStyles[7], displayName, tooltip } },
        });
        try {
            ui.open();
            assert.equal(ui.window.document.querySelectorAll('script').length, 1);
            assert.equal(ui.get('#injected-node'), null);
            assert.equal(ui.window.injected, undefined);
            assert.equal(ui.chests.length, 3);
            const pill = ui.get('.point-lottery__badge');
            assert.equal(pill.textContent, displayName);
            assert.equal(pill.getAttribute('title'), tooltip);
            assert.equal(pill.querySelector('img, script'), null);
        } finally { ui.dispose(); }
    });

    it('falls back safely when the badge catalog is missing without preventing prize delivery', async () => {
        const prize = badge(72, { name: '尚未提供样式的勋章', image: '' });
        const ui = fixture({ prizes: [prize], badgeStyles: undefined });
        try {
            ui.open();
            assert.equal(ui.get('.point-lottery__badge'), null);
            assert.match(ui.get('[data-point-lottery-prize-index="0"]').textContent, /尚未提供样式的勋章/);
            assert.equal(ui.get('[data-point-lottery-preview-name]').textContent, prize.name);
            ui.chests[0].click();
            ui.finish({ prize, prizeIndex: 0, points: 90, totalPoints: 100 });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            assert.equal(ui.get('[data-point-lottery-result-title]').textContent, prize.name);
            assert.match(ui.get('[data-point-lottery-result-validity]').textContent, /本次获得\s*3 天/);
            assert.equal(ui.get('[data-point-lottery-result]').classList.contains('is-error'), false);
        } finally { ui.dispose(); }
    });

    it('disables every chest for empty, exhausted, logged-out, and insufficient-point states', () => {
        for (const overrides of [{ prizes: [] }, { prizes: [badge(24, { available: false })] }, { canDraw: false }, { points: 9 }]) {
            const ui = fixture(overrides);
            try {
                ui.open();
                for (const chest of ui.chests) chest.click();
                assert.equal(ui.requests.length, 0);
                assert.ok(ui.chests.every((chest) => chest.disabled));
            } finally { ui.dispose(); }
        }
    });

    it('portals above the page stacking container while open and restores the exact original position on close', () => {
        const ui = fixture();
        try {
            const modal = ui.get('[data-point-lottery]');
            const originalParent = modal.parentNode;
            const originalPrevious = modal.previousSibling;
            const originalNext = modal.nextSibling;
            const trigger = ui.get('[data-point-lottery-open]');
            assert.equal(originalParent, ui.get('[data-fixture-parent]'));
            assert.equal(originalParent.closest('.slideout-panel').style.zIndex, '1');
            ui.window.document.body.style.overflow = 'scroll';
            for (let cycle = 0; cycle < 2; cycle++) {
                trigger.focus();
                ui.open();
                assert.equal(modal.parentNode, ui.window.document.body);
                assert.equal(originalParent.contains(modal), false);
                assert.equal(ui.window.document.querySelectorAll('[data-point-lottery]').length, 1);
                assert.equal(ui.window.document.body.style.overflow, 'hidden');
                ui.close();
                assert.equal(modal.parentNode, originalParent);
                assert.equal(modal.previousSibling, originalPrevious);
                assert.equal(modal.nextSibling, originalNext);
                assert.equal(modal.previousElementSibling, ui.get('[data-fixture-before]'));
                assert.equal(modal.nextElementSibling, ui.get('[data-fixture-after]'));
                assert.equal(ui.window.document.body.style.overflow, 'scroll');
                assert.equal(ui.window.document.activeElement, trigger);
            }
        } finally { ui.dispose(); }
    });

    it('locks all three chests against repeat clicks and keeps the lock across close and reopen', async () => {
        const ui = fixture();
        try {
            const modal = ui.get('[data-point-lottery]');
            const originalParent = modal.parentNode;
            ui.open();
            ui.chests[0].click();
            ui.chests[1].click();
            assert.equal(ui.requests.length, 1);
            assert.ok(ui.chests.every((chest) => chest.disabled));
            ui.close();
            assert.equal(modal.parentNode, originalParent);
            ui.open();
            assert.equal(modal.parentNode, ui.window.document.body);
            ui.chests[2].click();
            assert.equal(ui.requests.length, 1);
            assert.equal(ui.get('[data-point-lottery-chest-stage]').getAttribute('aria-busy'), 'true');
            ui.finish({ prize: badge(72), prizeIndex: 1, points: 90, totalPoints: 100, prizes: [badge(24), badge(72)] });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            assert.equal(ui.get('[data-point-lottery-points]').textContent, '90');
            assert.match(ui.get('[data-point-lottery-preview-meta]').textContent, /3 天/);
            assert.match(ui.get('[data-point-lottery-result-validity]').textContent, /本次获得\s*3 天/);
            assert.equal(ui.get('[data-point-lottery-prize-index="1"]').getAttribute('aria-pressed'), 'true');
            ui.get('[data-point-lottery-result-close]').click();
            ui.get('[data-point-lottery-win-index="0"]').click();
            assert.match(ui.get('[data-point-lottery-preview-meta]').textContent, /(?:本次获得|抽中奖品)[:：]?\s*3 天/);
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
            ui.chests[1].click();
            ui.close();
            ui.finish({ prize: badge(24), prizeIndex: 0, points: 90, totalPoints: 100 });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            assert.equal(ui.get('[data-point-lottery]').hidden, true);
            assert.equal(ui.window.document.querySelectorAll('[data-point-lottery] img').length, 0);
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
            ui.chests[0].click();
            ui.requests[0].resolve({ ok: true, json: async () => ({ ok: false, error: { message: '测试失败' } }) });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden && !ui.chests[0].disabled);
            assert.equal(ui.get('[data-point-lottery-result-title]').textContent, '测试失败');
            assert.equal(ui.get('[data-point-lottery-points]').textContent, '100');
            ui.get('[data-point-lottery-result-close]').click();
            ui.chests[2].click();
            assert.equal(ui.requests.length, 2);
            ui.requests[1].reject(new Error('网络错误'));
            await eventually(() => ui.get('[data-point-lottery-result-title]').textContent === '网络错误');
        } finally { ui.dispose(); }
    });

    it('uses refreshed availability after a win and stops drawing when the eligible pool is exhausted', async () => {
        const ui = fixture({ prizes: [badge(24)] });
        try {
            ui.open();
            ui.chests[2].click();
            ui.finish({ prize: badge(24), prizeIndex: 0, points: 90, totalPoints: 100, prizes: [badge(24, { available: false })] });
            await eventually(() => !ui.get('[data-point-lottery-result]').hidden
                && ui.get('[data-point-lottery-chest-stage]').getAttribute('aria-busy') === 'false');
            assert.ok(ui.chests.every((chest) => chest.disabled));
            assert.match(ui.get('[data-point-lottery-status]').textContent, /已全部抽完/);
            assert.match(ui.get('[data-point-lottery-prize-index="0"]').textContent, /0% · 已获得/);
        } finally { ui.dispose(); }
    });
});
