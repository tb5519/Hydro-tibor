const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const source = fs.readFileSync(path.join(__dirname, '../packages/ui-default/templates/manage_user_management.html'), 'utf8');
class Loader extends nunjucks.Loader {
    getSource(name) {
        const templates = {
            'manage_user_management.html': source,
            'manage_base.html': '<!doctype html><html><body>{% block manage_content %}{% endblock %}</body></html>',
        };
        return templates[name] ? { src: templates[name], path: name, noCache: true } : null;
    }
}
const env = new nunjucks.Environment(new Loader(), { autoescape: true });

function page(joinedCount = 2) {
    const student = {
        uid: 44, uname: 'leo', displayName: 'Leo', mail: 'leo@invalid.local',
        studentLevel: 1, cppEditorMode: 'proficient', submitCount: 0, acceptedCount: 0,
        domainNames: ['Python 训练', 'Scratch 创作'], searchText: 'leo',
    };
    const domains = [
        { id: 'system', name: 'Python 训练' },
        { id: 'S0001', name: 'Scratch 创作' },
        { id: 'C0001', name: 'C++ 训练' },
    ];
    const html = env.render('manage_user_management.html', {
        _: (value) => value,
        url: () => '/manage/users',
        avatarUrl: () => '/avatar.png',
        students: [student], selectedStudent: student,
        selectedStudentDomains: domains.slice(0, joinedCount === 1 ? 1 : 2),
        selectedStudentJoinedDomainCount: joinedCount,
        selectedStudentDefaultDomain: 'system',
        allDomains: domains, studentLevels: [{ value: 1, label: '1 级' }],
        sort: 'submit', order: 'desc', saved: 0,
    });
    const dom = new JSDOM(html, {
        runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/manage/users?uid=44',
    });
    dom.window.eval(dom.window.document.querySelector('script').textContent);
    return dom;
}

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
