import type { Context } from '../context';
import {
    DomainAlreadyExistsError, ForbiddenError, NotFoundError, UserNotFoundError, ValidationError, VerifyPasswordError,
} from '../error';
import type { WorkspaceDoc, WorkspaceMemberDoc, WorkspaceRole } from '../interface';
import { PERM, PRIV } from '../model/builtin';
import domain from '../model/domain';
import * as oplog from '../model/oplog';
import user from '../model/user';
import workspace from '../model/workspace';
import {
    Handler, param, post, requireSudo, route, Types,
} from '../service/server';
import { randomstring } from '../utils';

const WORKSPACE_MEMBER_ROLES: WorkspaceRole[] = ['admin', 'teacher', 'assistant'];

function getWorkspaceDomainRole(role: WorkspaceRole) {
    return role === 'assistant' ? 'default' : 'root';
}

async function syncWorkspaceDomainAccess(workspaceId: string, domainId: string) {
    const members = await workspace.getMembers(workspaceId);
    await Promise.all(members.map((member) => domain.setUserRole(
        domainId, member.uid, getWorkspaceDomainRole(member.role), true,
    )));
    const accounts = members.length
        ? await user.coll.find({ _id: { $in: members.map((item) => item.uid) } }, { projection: { _id: 1, defaultDomain: 1 } }).toArray()
        : [];
    await Promise.all(accounts
        .filter((account) => !account.defaultDomain)
        .map((account) => user.setById(account._id, { defaultDomain: domainId })));
}

async function resetDefaultDomainAfterWorkspaceRemoval(uid: number, removedWorkspaceId: string) {
    const account = await user.coll.findOne({ _id: uid }, { projection: { defaultDomain: 1 } });
    if (!account?.defaultDomain) return;
    const currentDomain = await domain.get(account.defaultDomain);
    if (!currentDomain || workspace.resolveDomainWorkspaceId(currentDomain) !== removedWorkspaceId) return;
    const nextWorkspace = await workspace.getPrimaryForUser(uid) || await workspace.getPrimaryForStudent(uid);
    const nextDomains = nextWorkspace ? await workspace.getDomains(nextWorkspace._id) : [];
    await user.setById(uid, { defaultDomain: nextDomains[0]?._id || '' });
}

class WorkspaceFeatureHandler extends Handler {
    noCheckPermView = true;

    ensureFeatureEnabled() {
        if (!workspace.isEnabled()) throw new NotFoundError('Workspace');
    }
}

class PlatformWorkspaceHandler extends WorkspaceFeatureHandler {
    async prepare() {
        this.ensureFeatureEnabled();
        if (!workspace.isPlatformAdmin(this.user._id)) throw new NotFoundError('Workspace');
    }

    @param('created', Types.String, true)
    async get(domainId: string, created = '') {
        const workspaces = await workspace.list();
        const cards = await Promise.all(workspaces.map(async (item) => {
            const owner = await user.getById('system', item.ownerUid);
            return {
                ...item,
                stats: await workspace.getStats(item._id),
                ownerLabel: owner?.uname || `UID ${item.ownerUid}`,
            };
        }));
        this.response.template = 'platform_workspace.html';
        this.response.body = {
            workspaces: cards,
            created,
            canCreate: workspace.canCreateTeacherWorkspace(),
        };
    }

    @requireSudo
    @post('code', Types.String)
    @post('name', Types.String)
    @post('owner', Types.UidOrName)
    @post('domainCode', Types.DomainId)
    @post('domainName', Types.String)
    async postCreate(
        domainId: string, code: string, name: string, owner: string,
        initialDomainId: string, domainName: string,
    ) {
        if (!workspace.canCreateTeacherWorkspace()) throw new ForbiddenError();
        const normalizedCode = code.trim().toLowerCase();
        const normalizedName = name.trim();
        const normalizedDomainName = domainName.trim();
        if (!/^[a-z][a-z0-9-]{2,31}$/.test(normalizedCode)) throw new ValidationError('code');
        if (!normalizedName || normalizedName.length > 64) throw new ValidationError('name');
        if (!normalizedDomainName || normalizedDomainName.length > 64) throw new ValidationError('domainName');
        if (await workspace.get(normalizedCode)) throw new ValidationError('code');
        if (await domain.get(initialDomainId)) throw new DomainAlreadyExistsError(initialDomainId);
        const ownerDoc = /^\d+$/.test(owner)
            ? await user.getById('system', +owner)
            : await user.getByUname('system', owner);
        if (!ownerDoc || ownerDoc._id <= 1 || !ownerDoc.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            throw new UserNotFoundError(owner);
        }
        if (await workspace.getAssignedWorkspaceIds(ownerDoc._id).then((items) => items.length > 0)) {
            throw new ValidationError('owner');
        }
        const created = await workspace.create(normalizedCode, normalizedName, ownerDoc._id);
        try {
            await domain.add(initialDomainId, ownerDoc._id, normalizedDomainName, '', created._id);
        } catch (error) {
            await Promise.all([
                workspace.coll.deleteOne({ _id: created._id }),
                workspace.collMember.deleteMany({ workspaceId: created._id }),
            ]);
            throw error;
        }
        await syncWorkspaceDomainAccess(created._id, initialDomainId);
        await user.setById(ownerDoc._id, { defaultDomain: initialDomainId });
        await oplog.log(this, 'workspace.create', {
            workspaceId: created._id,
            ownerUid: ownerDoc._id,
            domainId: initialDomainId,
        });
        this.response.redirect = this.url('platform_workspace', { query: { created: created._id } });
    }
}

class WorkspaceScopedHandler extends WorkspaceFeatureHandler {
    workspaceDoc: WorkspaceDoc;
    workspaceMember: WorkspaceMemberDoc | null;

    @route('workspaceCode', Types.String)
    async prepare(domainId: string, workspaceCode: string) {
        this.ensureFeatureEnabled();
        this.workspaceDoc = await workspace.get(workspaceCode);
        if (!this.workspaceDoc || this.workspaceDoc.status !== 'active') throw new NotFoundError('Workspace');
        this.workspaceMember = await workspace.getMember(this.workspaceDoc._id, this.user._id);
        if (!workspace.isPlatformAdmin(this.user._id) && !this.workspaceMember) throw new NotFoundError('Workspace');
    }

    canManageMembers() {
        return workspace.isPlatformAdmin(this.user._id)
            || ['owner', 'admin'].includes(this.workspaceMember?.role || '');
    }

    canManageStudents() {
        return workspace.isPlatformAdmin(this.user._id)
            || ['owner', 'admin', 'teacher'].includes(this.workspaceMember?.role || '');
    }

    ensureModernWorkspace() {
        if (this.workspaceDoc.legacy) throw new NotFoundError('Workspace');
    }

    async getWorkspaceDomain(domainCode: string) {
        const target = await domain.get(domainCode);
        if (!target || workspace.resolveDomainWorkspaceId(target) !== this.workspaceDoc._id) {
            throw new ValidationError('domainCode');
        }
        return target;
    }
}

class WorkspaceDashboardHandler extends WorkspaceScopedHandler {
    @param('createdDomain', Types.DomainId, true)
    async get(domainId: string, createdDomain = '') {
        const domains = await workspace.getDomains(this.workspaceDoc._id);
        const stats = await workspace.getStats(this.workspaceDoc._id);
        const canCreateDomain = this.canManageStudents();
        this.response.template = 'workspace_dashboard.html';
        this.response.body = {
            workspace: this.workspaceDoc,
            workspaceMember: this.workspaceMember,
            domains,
            stats,
            canCreateDomain,
            showWorkspaceTools: !this.workspaceDoc.legacy,
            canManageMembers: this.canManageMembers(),
            canReturnPlatform: workspace.isPlatformAdmin(this.user._id),
            createdDomain,
        };
    }

    @requireSudo
    @post('domainCode', Types.DomainId)
    @post('name', Types.String)
    async postCreateDomain(domainId: string, domainCode: string, name: string) {
        if (!this.canManageStudents()) throw new ForbiddenError();
        const normalizedName = name.trim();
        if (!normalizedName || normalizedName.length > 64) throw new ValidationError('name');
        if (await domain.get(domainCode)) throw new DomainAlreadyExistsError(domainCode);
        await domain.add(domainCode, this.workspaceDoc.ownerUid, normalizedName, '', this.workspaceDoc._id);
        await syncWorkspaceDomainAccess(this.workspaceDoc._id, domainCode);
        await oplog.log(this, 'workspace.createDomain', {
            workspaceId: this.workspaceDoc._id,
            domainId: domainCode,
        });
        this.response.redirect = this.url('domain_dashboard', { domainId: domainCode });
    }
}

class WorkspaceMembersHandler extends WorkspaceScopedHandler {
    @route('workspaceCode', Types.String)
    async prepare(domainId: string, workspaceCode: string) {
        await super.prepare(domainId, workspaceCode);
        this.ensureModernWorkspace();
        if (!this.canManageMembers()) throw new NotFoundError('Workspace');
    }

    @param('added', Types.Int, true)
    @param('updated', Types.Int, true)
    @param('removed', Types.Int, true)
    async get(domainId: string, added = 0, updated = 0, removed = 0) {
        const members = await workspace.getMembers(this.workspaceDoc._id);
        const uids = members.map((item) => item.uid);
        const udict = uids.length ? await user.getListForRender('system', uids, true) : {};
        this.response.template = 'workspace_members.html';
        this.response.body = {
            workspace: this.workspaceDoc,
            members,
            udict,
            added,
            updated,
            removed,
        };
    }

    @requireSudo
    @post('account', Types.UidOrName)
    @post('role', Types.Range(WORKSPACE_MEMBER_ROLES))
    async postAddMember(domainId: string, account: string, role: WorkspaceRole) {
        const target = /^\d+$/.test(account)
            ? await user.getById('system', +account)
            : await user.getByUname('system', account);
        if (!target || target._id <= 1 || !target.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            throw new UserNotFoundError(account);
        }
        if (target._id === this.workspaceDoc.ownerUid) throw new ValidationError('account');
        if (await workspace.isAssignedToOtherWorkspace(target._id, this.workspaceDoc._id)) {
            throw new ValidationError('account');
        }
        await workspace.addMember(this.workspaceDoc._id, target._id, role);
        await workspace.disableStudent(this.workspaceDoc._id, target._id);
        const domains = await workspace.getDomains(this.workspaceDoc._id);
        await Promise.all(domains.map((item) => domain.setUserRole(
            item._id, target._id, getWorkspaceDomainRole(role), true,
        )));
        if (domains.length) await user.setById(target._id, { defaultDomain: domains[0]._id });
        await oplog.log(this, 'workspace.addMember', {
            workspaceId: this.workspaceDoc._id,
            uid: target._id,
            role,
        });
        this.response.redirect = this.url('workspace_members', {
            workspaceCode: this.workspaceDoc.code,
            query: { added: target._id },
        });
    }

    @requireSudo
    @post('uid', Types.Int)
    @post('role', Types.Range(WORKSPACE_MEMBER_ROLES))
    async postUpdateMember(domainId: string, uid: number, role: WorkspaceRole) {
        const current = await workspace.getMember(this.workspaceDoc._id, uid);
        if (!current || current.role === 'owner') throw new ValidationError('uid');
        await workspace.addMember(this.workspaceDoc._id, uid, role);
        const domains = await workspace.getDomains(this.workspaceDoc._id);
        await Promise.all(domains.map((item) => domain.setUserRole(
            item._id, uid, getWorkspaceDomainRole(role), true,
        )));
        await oplog.log(this, 'workspace.updateMember', {
            workspaceId: this.workspaceDoc._id,
            uid,
            role,
        });
        this.response.redirect = this.url('workspace_members', {
            workspaceCode: this.workspaceDoc.code,
            query: { updated: uid },
        });
    }

    @requireSudo
    @post('uid', Types.Int)
    async postRemoveMember(domainId: string, uid: number) {
        const current = await workspace.getMember(this.workspaceDoc._id, uid);
        if (!current || current.role === 'owner') throw new ValidationError('uid');
        await workspace.disableMember(this.workspaceDoc._id, uid);
        const domains = await workspace.getDomains(this.workspaceDoc._id);
        await Promise.all(domains.map((item) => domain.setUserInDomain(
            item._id, uid, { join: false, role: 'default' },
        )));
        await resetDefaultDomainAfterWorkspaceRemoval(uid, this.workspaceDoc._id);
        await oplog.log(this, 'workspace.removeMember', {
            workspaceId: this.workspaceDoc._id,
            uid,
        });
        this.response.redirect = this.url('workspace_members', {
            workspaceCode: this.workspaceDoc.code,
            query: { removed: uid },
        });
    }
}

class WorkspaceStudentsHandler extends WorkspaceScopedHandler {
    @route('workspaceCode', Types.String)
    async prepare(domainId: string, workspaceCode: string) {
        await super.prepare(domainId, workspaceCode);
        this.ensureModernWorkspace();
    }

    @param('q', Types.Content, true)
    @param('added', Types.Int, true)
    @param('created', Types.Int, true)
    @param('removed', Types.Int, true)
    async get(domainId: string, q = '', added = 0, created = 0, removed = 0) {
        const domains = await workspace.getDomains(this.workspaceDoc._id);
        const domainIds = domains.map((item) => item._id);
        const memberships = domainIds.length
            ? await domain.collUser.find({ domainId: { $in: domainIds }, uid: { $gt: 1 }, join: true })
                .project<{ uid: number, domainId: string, displayName?: string, nSubmit?: number, nAccept?: number }>({
                    uid: 1, domainId: 1, displayName: 1, nSubmit: 1, nAccept: 1,
                })
                .toArray()
            : [];
        const memberUids = new Set((await workspace.getMembers(this.workspaceDoc._id)).map((item) => item.uid));
        const candidateUids = Array.from(new Set(memberships.map((item) => item.uid)))
            .filter((uid) => !memberUids.has(uid));
        const userPrivDocs = candidateUids.length
            ? await user.getMulti({ _id: { $in: candidateUids } }, ['_id', 'priv']).toArray()
            : [];
        const studentUids = userPrivDocs
            .filter((item) => (item.priv & PRIV.PRIV_USER_PROFILE) && !(item.priv & PRIV.PRIV_EDIT_SYSTEM))
            .map((item) => item._id);
        const udict = studentUids.length ? await user.getListForRender('system', studentUids, true) : {};
        const domainNames = new Map(domains.map((item) => [item._id, item.name || item._id]));
        const byUid = new Map<number, typeof memberships>();
        for (const membership of memberships) {
            byUid.set(membership.uid, [...(byUid.get(membership.uid) || []), membership]);
        }
        const query = q.trim().toLocaleLowerCase();
        const students = studentUids.map((uid) => {
            const account = udict[uid];
            const joined = byUid.get(uid) || [];
            return {
                uid,
                account,
                displayName: joined.find((item) => item.displayName)?.displayName || account?.displayName || account?.uname,
                domainNames: joined.map((item) => domainNames.get(item.domainId) || item.domainId),
                submitCount: joined.reduce((sum, item) => sum + (item.nSubmit || 0), 0),
                acceptedCount: joined.reduce((sum, item) => sum + (item.nAccept || 0), 0),
            };
        }).filter((item) => !query || [
            item.uid, item.account?.uname, item.account?.mail, item.displayName, ...item.domainNames,
        ].some((value) => `${value || ''}`.toLocaleLowerCase().includes(query)))
            .sort((a, b) => b.submitCount - a.submitCount || a.uid - b.uid)
            .slice(0, 300);
        this.response.template = 'workspace_students.html';
        this.response.body = {
            workspace: this.workspaceDoc,
            domains,
            students,
            canManageStudents: this.canManageStudents(),
            canManageMembers: this.canManageMembers(),
            q,
            added,
            created,
            removed,
        };
    }

    @requireSudo
    @post('account', Types.UidOrName)
    @post('domainCode', Types.DomainId)
    async postAddExisting(domainId: string, account: string, domainCode: string) {
        if (!this.canManageStudents()) throw new ForbiddenError();
        const targetDomain = await this.getWorkspaceDomain(domainCode);
        const target = /^\d+$/.test(account)
            ? await user.getById('system', +account)
            : await user.getByUname('system', account);
        if (!target || target._id <= 1 || !target.hasPriv(PRIV.PRIV_USER_PROFILE)
            || target.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) throw new UserNotFoundError(account);
        if (await workspace.getMember(this.workspaceDoc._id, target._id)) throw new ValidationError('account');
        if (await workspace.isAssignedToOtherWorkspace(target._id, this.workspaceDoc._id)) {
            throw new ValidationError('account');
        }
        await domain.setUserInDomain(targetDomain._id, target._id, { join: true, role: 'default' });
        await workspace.addStudent(this.workspaceDoc._id, target._id, this.user._id);
        await user.setById(target._id, { defaultDomain: targetDomain._id });
        await oplog.log(this, 'workspace.addStudent', {
            workspaceId: this.workspaceDoc._id,
            domainId: targetDomain._id,
            uid: target._id,
        });
        this.response.redirect = this.url('workspace_students', {
            workspaceCode: this.workspaceDoc.code,
            query: { added: target._id },
        });
    }

    @requireSudo
    @post('uid', Types.Int)
    async postRemoveStudent(domainId: string, uid: number) {
        if (!this.canManageStudents()) throw new ForbiddenError();
        const target = await user.getById('system', uid);
        if (!target || await workspace.getMember(this.workspaceDoc._id, uid)) throw new ValidationError('uid');
        const domains = await workspace.getDomains(this.workspaceDoc._id);
        const joined = await domain.collUser.countDocuments({
            domainId: { $in: domains.map((item) => item._id) }, uid, join: true,
        });
        if (!joined) throw new ValidationError('uid');
        await Promise.all(domains.map((item) => domain.setUserInDomain(
            item._id, uid, { join: false, role: 'default' },
        )));
        await workspace.disableStudent(this.workspaceDoc._id, uid);
        await resetDefaultDomainAfterWorkspaceRemoval(uid, this.workspaceDoc._id);
        await oplog.log(this, 'workspace.removeStudent', {
            workspaceId: this.workspaceDoc._id,
            uid,
        });
        this.response.redirect = this.url('workspace_students', {
            workspaceCode: this.workspaceDoc.code,
            query: { removed: uid },
        });
    }

    @requireSudo
    @post('uname', Types.Username)
    @post('mail', Types.Email, true)
    @post('password', Types.Password)
    @post('verifyPassword', Types.Password)
    @post('displayName', Types.String)
    @post('domainCode', Types.DomainId)
    async postCreateStudent(
        domainId: string, uname: string, mail: string | undefined, password: string,
        verifyPassword: string, displayName: string, domainCode: string,
    ) {
        if (!this.canManageStudents()) throw new ForbiddenError();
        if (password !== verifyPassword) throw new VerifyPasswordError();
        const normalizedDisplayName = displayName.trim();
        if (!normalizedDisplayName || normalizedDisplayName.length > 64) throw new ValidationError('displayName');
        const targetDomain = await this.getWorkspaceDomain(domainCode);
        const accountMail = mail?.trim() || `${randomstring(12)}@invalid.local`;
        const uid = await user.create(accountMail, uname, password);
        await Promise.all([
            domain.setUserInDomain(targetDomain._id, uid, {
                join: true,
                role: 'default',
                displayName: normalizedDisplayName,
            }),
            user.setById(uid, { defaultDomain: targetDomain._id, cppEditorMode: 'proficient' }),
            workspace.addStudent(this.workspaceDoc._id, uid, this.user._id),
        ]);
        await oplog.log(this, 'workspace.createStudent', {
            workspaceId: this.workspaceDoc._id,
            domainId: targetDomain._id,
            uid,
        });
        this.response.redirect = this.url('workspace_students', {
            workspaceCode: this.workspaceDoc.code,
            query: { created: uid },
        });
    }
}

class DomainWorkspaceEntryHandler extends WorkspaceFeatureHandler {
    async get() {
        this.ensureFeatureEnabled();
        if (!this.domain.workspaceId) throw new NotFoundError('Workspace');
        const target = await workspace.get(this.domain.workspaceId);
        const member = target ? await workspace.getMember(target._id, this.user._id) : null;
        if (!target || (!workspace.isPlatformAdmin(this.user._id) && !member)) throw new NotFoundError('Workspace');
        this.response.redirect = this.url('workspace_dashboard', { workspaceCode: target.code });
    }
}

export async function apply(ctx: Context) {
    ctx.Route('platform_workspace', '/platform/workspaces', PlatformWorkspaceHandler);
    ctx.Route('workspace_dashboard', '/workspace/:workspaceCode', WorkspaceDashboardHandler);
    ctx.Route('workspace_members', '/workspace/:workspaceCode/members', WorkspaceMembersHandler);
    ctx.Route('workspace_students', '/workspace/:workspaceCode/students', WorkspaceStudentsHandler);
    ctx.Route('domain_workspace', '/domain/workspace', DomainWorkspaceEntryHandler, PERM.PERM_EDIT_DOMAIN);
    ctx.injectUI(
        'Nav', 'platform_workspace',
        { prefix: 'platform_workspace', before: 'manage_dashboard' },
        (handler) => workspace.isPlatformAdmin(handler.user._id),
    );
    ctx.injectUI(
        'DomainManage', 'domain_workspace',
        { family: 'Properties', icon: 'user', before: 'domain_ranking_setting' },
        PERM.PERM_EDIT_DOMAIN,
        (handler) => workspace.isEnabled() && !!handler.domain?.workspaceId,
    );
}
