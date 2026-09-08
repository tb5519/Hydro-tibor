const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const filename = path.join(__dirname, '../packages/ui-default/components/record_list.ts');
const output = esbuild.transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' });
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(output.code, sandbox);
const { updateRecordList } = sandbox.module.exports;
const row = (rid, status = '1', lang = 'py', text = rid) => (
    `<tr data-rid="${rid}" data-record-status="${status}" data-record-lang="${lang}"><td>${text}</td></tr>`
);

function fixture(rows = '', overrides = {}) {
    const dom = new JSDOM(`<main class="record-list">
      <span data-record-count>0</span><div class="record-list__empty">暂无记录</div>
      <div class="record-list__table-wrap" hidden><table class="record_main__table"><tbody>${rows}</tbody></table></div>
    </main>`);
    const events = [];
    const options = {
        page: 1,
        noPush: false,
        limit: 3,
        onRemove: (node) => events.push(`remove:${node.dataset.rid}`),
        onNew: (node) => events.push(`new:${node.dataset.rid}`),
        patchRow: (previous, incoming) => {
            previous.innerHTML = incoming.innerHTML;
            for (const attribute of incoming.attributes) previous.setAttribute(attribute.name, attribute.value);
        },
        ...overrides,
    };
    const document = dom.window.document;
    return {
        document, events,
        update: (html) => updateRecordList(document, html, options),
        ids: () => [...document.querySelectorAll('tbody tr')].map((node) => node.dataset.rid),
        close: () => dom.window.close(),
    };
}

describe('record list live updates', () => {
    it('reveals the first live record in an empty list instead of immediately deleting it', () => {
        const app = fixture();
        try {
            app.update(row('first'));
            assert.deepEqual(app.ids(), ['first']);
            assert.equal(app.document.querySelector('.record-list__empty').hidden, true);
            assert.equal(app.document.querySelector('.record-list__table-wrap').hidden, false);
            assert.equal(app.document.querySelector('[data-record-count]').textContent, '1');
        } finally { app.close(); }
    });

    it('allows an underfilled page to grow and only trims beyond the configured page size', () => {
        const app = fixture(row('oldest'));
        try {
            app.update(row('middle'));
            app.update(row('newer'));
            app.update(row('newest'));
            assert.deepEqual(app.ids(), ['newest', 'newer', 'middle']);
            assert.ok(app.events.includes('remove:oldest'));
        } finally { app.close(); }
    });

    it('patches an existing record without duplicating it or changing its row position', () => {
        const app = fixture(row('second') + row('first', '0', 'py', 'Waiting'));
        try {
            const previous = app.document.querySelector('[data-rid="first"]');
            app.update(row('first', '1', 'py', 'Accepted'));
            assert.deepEqual(app.ids(), ['second', 'first']);
            assert.equal(app.document.querySelector('[data-rid="first"]'), previous);
            assert.equal(previous.textContent, 'Accepted');
            assert.deepEqual(app.events, ['remove:first', 'new:first']);
        } finally { app.close(); }
    });

    it('honors status 0 and language filters when new records arrive', () => {
        const app = fixture('', { status: '0', lang: 'py' });
        try {
            app.update(row('accepted', '1', 'py'));
            app.update(row('cpp', '0', 'cc'));
            app.update(row('waiting', '0', 'py'));
            assert.deepEqual(app.ids(), ['waiting']);
        } finally { app.close(); }
    });

    it('removes a record that no longer matches the filter and restores the empty state', () => {
        const app = fixture(row('waiting', '0'), { status: '0' });
        try {
            app.update(row('waiting', '1'));
            assert.deepEqual(app.ids(), []);
            assert.equal(app.document.querySelector('.record-list__empty').hidden, false);
            assert.equal(app.document.querySelector('.record-list__table-wrap').hidden, true);
            assert.equal(app.document.querySelector('[data-record-count]').textContent, '0');
        } finally { app.close(); }
    });

    it('does not insert live records into later pages or nopush views but still updates existing rows', () => {
        for (const overrides of [{ page: 2 }, { noPush: true }]) {
            const app = fixture(row('existing'), overrides);
            try {
                app.update(row('new'));
                app.update(row('existing', '2', 'py', 'Wrong Answer'));
                assert.deepEqual(app.ids(), ['existing']);
                assert.equal(app.document.querySelector('[data-rid="existing"]').textContent, 'Wrong Answer');
            } finally { app.close(); }
        }
    });

    it('ignores non-record websocket messages and pages without a list', () => {
        const app = fixture(row('existing'));
        try {
            for (const value of [null, undefined, {}, '', '<div>heartbeat</div>', '<tr><td>no id</td></tr>']) app.update(value);
            assert.deepEqual(app.ids(), ['existing']);
            app.document.querySelector('table').remove();
            assert.doesNotThrow(() => app.update(row('new')));
        } finally { app.close(); }
    });
});

it('initializes filter autocomplete only when the role-specific controls exist', () => {
    const source = fs.readFileSync(path.join(__dirname, '../packages/ui-default/pages/record_main.page.ts'), 'utf8');
    assert.match(source, /if \(\$userFilter\.length\) \{\s*UserSelectAutoComplete/);
    assert.match(source, /if \(\$problemFilter\.length\) \{\s*ProblemSelectAutoComplete/);
    assert.match(source, /if \(\$languageFilter\.length\)/);
    assert.ok(source.indexOf('$userFilter.length') < source.indexOf('await Promise.all'));
});
