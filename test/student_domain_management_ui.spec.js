const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { page } = require('./fixtures/student_management_ui');

describe('student domain management editor', () => {
    it('opens a scoped removal confirmation without selecting a different default domain', (t) => {
        const dom = page();
        t.after(() => dom.window.close());
        const { document } = dom.window;
        const radios = [...document.querySelectorAll('input[name="defaultDomain"]')];
        assert.equal(radios.length, 2);
        assert.equal(document.querySelectorAll('form form').length, 0);
        const remove = document.querySelector('[data-student-domain-remove][data-domain-id="S0001"]');
        remove.click();
        const dialog = document.querySelector('[data-student-domain-dialog]');
        assert.equal(dialog.hidden, false);
        assert.match(dialog.querySelector('[data-student-domain-description]').textContent, /Leo.*Scratch 创作/);
        assert.match(dialog.querySelector('[data-student-domain-note]').textContent, /数据会保留/);
        assert.equal(dialog.querySelector('[data-student-domain-operation]').value, 'remove_student_domain');
        assert.equal(dialog.querySelector('[data-student-domain-code]').value, 'S0001');
        assert.equal(radios[0].checked, true);
        assert.equal(radios[1].checked, false);
        dialog.querySelector('.student-domain-dialog__close').click();
        assert.equal(dialog.hidden, true);
    });

    it('offers only unjoined domains and prevents removing the only joined domain', (t) => {
        const dom = page(1);
        t.after(() => dom.window.close());
        const { document } = dom.window;
        document.querySelector('[data-student-domain-remove]').click();
        const dialog = document.querySelector('[data-student-domain-dialog]');
        assert.equal(dialog.querySelector('[data-student-domain-confirm]').disabled, true);
        assert.match(dialog.querySelector('[data-student-domain-error]').textContent, /至少需要保留一个域/);
        dialog.querySelector('.student-domain-dialog__close').click();
        document.querySelector('[data-student-domain-add-open]').click();
        assert.equal(dialog.querySelector('[data-student-domain-operation]').value, 'add_student_domain');
        assert.equal(dialog.querySelector('option[value="system"]').disabled, true);
        assert.equal(dialog.querySelector('option[value="C0001"]').disabled, false);
        assert.equal(dialog.querySelector('[data-student-domain-confirm]').disabled, false);
    });

    it('submits the selected domain without changing the student information form', async (t) => {
        const dom = page();
        t.after(() => dom.window.close());
        const { document } = dom.window;
        let posted;
        dom.window.fetch = async (url, options) => {
            posted = { url, options };
            throw new Error('连接中断');
        };
        const editorForm = document.querySelector('.student-management__form');
        const originalName = editorForm.querySelector('[name="uname"]').value;
        document.querySelector('[data-student-domain-add-open]').click();
        const dialog = document.querySelector('[data-student-domain-dialog]');
        dialog.querySelector('[data-student-domain-select]').value = 'C0001';
        const form = dialog.querySelector('[data-student-domain-form]');
        form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(new URL(posted.url).pathname, '/manage/users');
        assert.equal(posted.options.method, 'POST');
        assert.deepEqual(Object.fromEntries(posted.options.body.entries()), {
            operation: 'add_student_domain', uid: '44', sort: 'submit', order: 'desc', domainCode: 'C0001',
        });
        assert.equal(editorForm.querySelector('[name="uname"]').value, originalName);
        assert.match(dialog.querySelector('[data-student-domain-error]').textContent, /连接中断/);
    });
});
