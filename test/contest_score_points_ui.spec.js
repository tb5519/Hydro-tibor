const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const compiled = esbuild.transformSync(fs.readFileSync(
    path.join(__dirname, '../packages/ui-default/components/contest_points.tsx'), 'utf8',
), { loader: 'tsx', format: 'cjs' }).code;
const componentModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, componentModule, componentModule.exports);
const { ContestPoints } = componentModule.exports;
const render = (award) => new JSDOM(renderToStaticMarkup(React.createElement(ContestPoints, { award }))).window.document;
const badge = (id) => ({ id, name: `勋章 ${id}`, backgroundColor: '#dbeafe', fontColor: '#1e40af' });

describe('contest point receipt UI', () => {
    it('shows the real credited base and extra 10 points with both contributing badges', () => {
        const doc = render({ points: 110, basePoints: 100, bonusPoints: 10, contestPoints: 110, badgePercent: 10, badges: [badge(1), badge(2)] });
        assert.match(doc.body.textContent, /本次积分到账\+110 积分/);
        assert.match(doc.body.textContent, /比赛得分奖励 \+100/);
        assert.match(doc.body.textContent, /勋章额外加成 \+10/);
        assert.match(doc.body.textContent, /满分后仍可额外获得/);
        assert.deepEqual([...doc.querySelectorAll('.contest-points__badge')].map((item) => item.textContent), ['勋章 1+5%', '勋章 2+5%']);
    });

    it('keeps many badges collapsed initially and safely displays long or HTML-like names', () => {
        const badges = Array.from({ length: 40 }, (_, index) => badge(index));
        badges[5].name = '<img src=x onerror=alert(1)> 这是一枚很长很长的勋章名称';
        const doc = render({ points: 300, basePoints: 100, bonusPoints: 200, contestPoints: 300, badgePercent: 200, badges });
        assert.equal(doc.querySelectorAll('.contest-points__bonus > .contest-points__badges > span').length, 4);
        assert.equal(doc.querySelectorAll('details .contest-points__badge').length, 36);
        assert.equal(doc.querySelector('details').open, false);
        assert.match(doc.querySelector('summary').textContent, /36/);
        assert.equal(doc.querySelectorAll('img').length, 0);
        assert.ok(doc.body.textContent.includes(badges[5].name));
    });

    it('handles no new points and non-points contests without claiming a bonus', () => {
        assert.equal(render(null).body.textContent, '');
        const doc = render({ points: 0, basePoints: 0, bonusPoints: 0, contestPoints: 110, badgePercent: 0, badges: [] });
        assert.match(doc.body.textContent, /本次未产生新的得分奖励/);
        assert.equal(doc.querySelector('.contest-points__bonus'), null);
        assert.match(doc.body.textContent, /本场已获得 110 积分/);
    });
});
