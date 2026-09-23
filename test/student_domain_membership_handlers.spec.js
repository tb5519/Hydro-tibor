const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const root = path.join(__dirname, '..');
const read = (filename) => fs.readFileSync(path.join(root, filename), 'utf8');

function section(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0, `Missing section start: ${start}`);
    assert.ok(to > from, `Missing section end: ${end}`);
    return source.slice(from, to);
}

describe('student account domain membership handler wiring', () => {
    it('creates accounts directly in the selected default domain at both real management entry points', () => {
        const manage = section(
            read('packages/hydrooj/src/handler/manage.ts'),
            'async postAddStudent(',
            'async postResetPassword(',
        );
        assert.match(manage, /user\.createInDomain\(joinTarget\._id, accountMail, uname, password\)/);
        assert.match(manage, /defaultDomain:\s*joinTarget\._id/);
        assert.doesNotMatch(manage, /user\.create\(/);

        const workspace = section(
            read('packages/hydrooj/src/handler/workspace.ts'),
            'async postCreateStudent(',
            'class DomainWorkspaceEntryHandler',
        );
        assert.match(workspace, /user\.createInDomain\(targetDomain\._id, accountMail, uname, password\)/);
        assert.match(workspace, /defaultDomain:\s*targetDomain\._id/);
        assert.doesNotMatch(workspace, /user\.create\(/);
    });

    it('retains the existing domain-admin permission and sudo boundary around protected removal', () => {
        const source = read('packages/hydrooj/src/handler/domain.ts');
        const manageBase = section(source, 'class ManageHandler', 'const DOMAIN_RANKING_MODES');
        assert.match(manageBase, /this\.checkPerm\(PERM\.PERM_EDIT_DOMAIN\)/);

        const users = section(source, 'class DomainUserHandler', 'class DomainRoleHandler');
        assert.match(users, /@requireSudo\s+@param\('uids',[\s\S]*?async postKick/);
        assert.match(users, /withDomainMembershipRemoval\(needUpdate, \[domainId\]/);
        assert.match(users, /domain\.setJoin\(domainId, target, false\)/);
    });

    it('checks workspace student-management permission before protected removal', () => {
        const source = read('packages/hydrooj/src/handler/workspace.ts');
        const removal = section(source, 'async postRemoveStudent(', 'async postCreateStudent(');
        const permission = removal.indexOf('if (!this.canManageStudents()) throw new ForbiddenError()');
        const mutation = removal.indexOf('withDomainMembershipRemoval(');
        assert.ok(permission >= 0 && mutation > permission);
        assert.match(removal, /domains\.map\(\(item\) => item\._id\)/);
        assert.match(removal, /workspace\.disableStudent/);
    });

    it('protects self-leave and keeps the explicit system self-leave restriction', () => {
        const leave = section(
            read('packages/hydrooj/src/handler/home.ts'),
            'async postLeave(',
            '\n    }\n}',
        );
        assert.match(leave, /if \(id === 'system'\) throw new BadRequestError\(\)/);
        assert.match(leave, /withDomainMembershipRemoval\(\[this\.user\._id\], \[id\]/);
    });

    it('allows an authorized administrator to explicitly join users to system', () => {
        const source = read('packages/ui-default/pages/domain_user.page.js');
        assert.match(source, /\.\.\.\(UiContext\.canForceJoin \? \{/);
        assert.doesNotMatch(source, /canForceJoin\s*&&\s*UiContext\.domain\._id\s*!==\s*['"]system['"]/);
    });
});
