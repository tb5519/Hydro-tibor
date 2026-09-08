const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const jquery = require('jquery');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'packages/ui-default/components/table/StyledTable.js'), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('export default class StyledTable', 'class StyledTable');

function fixture(native) {
    const dom = new JSDOM('<!doctype html><body><nav class="nav"></nav>'
        + '<section class="section__body contest-scoreboard-scroll">'
        + `<table class="data-table contest-scoreboard-table"${native ? ' data-table-native' : ''}>`
        + '<colgroup><col><col></colgroup><thead><tr><th>用户</th><th>总分数</th></tr></thead>'
        + '<tbody><tr><td>长姓名与多个徽章</td><td>100</td></tr></tbody></table></section></body>',
    { runScripts: 'outside-only' });
    const { window } = dom;
    window.$ = jquery(window);
    window.responsiveCutoff = { mobile: 500 };
    window.isBelow = () => false;
    window.DOMAttachedObject = class {
        constructor($dom) { this.$dom = $dom; }
    };
    window.eval(`${source}\nwindow.StyledTable = StyledTable;`);
    const table = window.document.querySelector('table');
    const header = table.tHead;
    const instance = new window.StyledTable(window.$(table));
    return { dom, window, table, header, instance };
}

describe('native table layout opt-out', () => {
    it('keeps the scoreboard header and body in the same table', () => {
        const { dom, window, table, header } = fixture(true);
        try {
            assert.equal(table.tHead, header);
            assert.equal(window.document.querySelectorAll('table').length, 1);
            assert.equal(window.document.querySelector('.section__table-header'), null);
            assert.equal(window.document.querySelector('.section__table-container'), null);
            assert.equal(table.tBodies[0].rows[0].cells[1].textContent, '100');
        } finally { dom.window.close(); }
    });

    it('preserves the existing sticky header for ordinary data tables', () => {
        const { dom, window, table, header } = fixture(false);
        try {
            assert.equal(table.tHead, null);
            assert.equal(window.document.querySelectorAll('table').length, 2);
            assert.equal(window.document.querySelector('.section__table-header').tHead, header);
            assert.equal(window.document.querySelector('.section__table-container').firstElementChild, table);
        } finally { dom.window.close(); }
    });
});
