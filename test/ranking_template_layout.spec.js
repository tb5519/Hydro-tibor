const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const postcss = require('postcss');
const { makeUsers, renderRankingFixture, productionCss } = require('./helpers/ranking_template_fixture');

describe('production ranking biography table layout', () => {
    for (const kind of ['ranking', 'homepage']) {
        it(`${kind} renders the real table and user macros for empty, short, long, and image biographies`, () => {
            const dom = new JSDOM(renderRankingFixture(kind));
            const { document } = dom.window;
            const table = document.querySelector('table');
            const users = makeUsers();
            const rows = [...table.tBodies[0].rows];
            assert.equal(rows.length, users.length);
            assert.equal(table.querySelectorAll('col.col--bio').length, 1);
            assert.equal(table.querySelectorAll('th.col--bio').length, 1);
            rows.forEach((row, index) => {
                assert.equal(row.cells.length, kind === 'ranking' ? 5 : 4);
                assert(row.cells[row.cells.length - 1].classList.contains('col--bio'));
                assert.equal(row.querySelectorAll('.user-profile-avatar').length, 1);
                assert.equal(row.querySelectorAll('.user-profile-badge--custom').length, Math.min(users[index].ownedBadges.length, 4) + (users[index].ownedBadges.length > 4 ? 1 : 0));
            });
            assert.equal(rows[0].querySelector('td.col--bio').textContent.trim(), '');
            assert.match(rows[1].querySelector('td.col--bio').textContent, /认真复习/);
            assert(rows[2].querySelector('td.col--bio').textContent.length < users[2].bio.length);
            assert.equal(rows[3].querySelector('td.col--bio img').getAttribute('src'), 'badge.svg');
            assert.equal(rows[3].querySelector('td.col--bio img').getAttribute('alt'), '最强王者');
            dom.window.close();
        });

        it(`${kind} keeps native biography column and cell display with production CSS and template styles combined`, () => {
            const html = `<!doctype html><html lang="zh" class="page--${kind}"><head><style>${productionCss()}</style></head><body>${renderRankingFixture(kind)}</body></html>`;
            const dom = new JSDOM(html);
            const { document } = dom.window;
            for (const column of document.querySelectorAll('col.col--bio')) {
                assert.equal(dom.window.getComputedStyle(column).display, 'table-column', `${kind} col must not inherit a table-cell declaration from an unqualified .col--bio selector`);
            }
            for (const cell of document.querySelectorAll('th.col--bio, td.col--bio')) {
                assert.equal(dom.window.getComputedStyle(cell).display, 'table-cell', `${kind} biography cells must preserve native row height`);
            }
            dom.window.close();
        });
    }

    it('built production CSS never turns a biography column or cell into a block or fixes its height', () => {
        const css = postcss.parse(productionCss());
        let mobileHideFound = false;
        css.walkRules((rule) => {
            if (!rule.selector.includes('.col--bio') || !/\.page--(?:ranking|homepage)/.test(rule.selector)) return;
            rule.walkDecls((declaration) => {
                if (declaration.prop === 'display') {
                    assert.notEqual(declaration.value, 'block', rule.selector);
                    if (declaration.value === 'none') {
                        let parent = rule.parent;
                        while (parent && parent.type !== 'atrule') parent = parent.parent;
                        assert.equal(parent?.name, 'media', 'biography hiding remains limited to responsive media rules');
                        mobileHideFound = true;
                    }
                }
                assert.notEqual(declaration.prop, 'height', `fixed cell heights leave a blank strip: ${rule.selector}`);
            });
        });
        assert(mobileHideFound, 'small screens retain the hidden biography column');
    });
});
