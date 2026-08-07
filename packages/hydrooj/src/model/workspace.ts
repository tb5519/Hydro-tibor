import { Filter } from 'mongodb';
import { Context } from '../context';
import type {
    DomainDoc, WorkspaceDoc, WorkspaceMemberDoc, WorkspaceRole, WorkspaceStatus,
} from '../interface';
import db from '../service/db';
import { PRIV } from './builtin';
import domain from './domain';
import system from './system';

export const LEGACY_WORKSPACE_ID = 'tang';
export const LEGACY_WORKSPACE_NAME = '唐老师工作区';

const coll = db.collection('workspace');
const collMember = db.collection('workspace.member');
const collStudent = db.collection('workspace.student');
const collUser = db.collection('user');

function normalizeCode(code: string) {
    return code.trim().toLowerCase();
}

class WorkspaceModel {
    static coll = coll;
    static collMember = collMember;
    static collStudent = collStudent;
    static LEGACY_WORKSPACE_ID = LEGACY_WORKSPACE_ID;

    static isEnabled() {
        return system.get('workspace.enabled') === true;
    }

    static canCreateTeacherWorkspace() {
        return WorkspaceModel.isEnabled() && system.get('workspace.newTeacherEnabled') === true;
    }

    static isPlatformAdmin(uid: number) {
        const configured = system.get('workspace.platformAdminUids');
        return WorkspaceModel.isEnabled()
            && Array.isArray(configured)
            && configured.some((item) => Number(item) === uid);
    }

    static resolveDomainWorkspaceId(ddoc?: Pick<DomainDoc, 'workspaceId'> | null) {
        return ddoc?.workspaceId || LEGACY_WORKSPACE_ID;
    }

    static getDomainQuery(workspaceId: string): Filter<DomainDoc> {
        if (workspaceId === LEGACY_WORKSPACE_ID) {
            return {
                $or: [
                    { workspaceId: LEGACY_WORKSPACE_ID },
                    { workspaceId: { $exists: false } },
                ],
            };
        }
        return { workspaceId };
    }

    static async getLegacyWorkspace(): Promise<WorkspaceDoc> {
        const systemDomain = await domain.get('system');
        const legacyOwner = await domain.coll.aggregate<{ _id: number }>([
            {
                $match: {
                    $and: [
                        WorkspaceModel.getDomainQuery(LEGACY_WORKSPACE_ID),
                        { _id: { $ne: 'system' }, owner: { $gt: 1 } },
                    ],
                },
            },
            { $group: { _id: '$owner', domainCount: { $sum: 1 } } },
            { $sort: { domainCount: -1, _id: 1 } },
            { $limit: 1 },
        ]).next();
        const now = new Date(0);
        return {
            _id: LEGACY_WORKSPACE_ID,
            code: LEGACY_WORKSPACE_ID,
            name: LEGACY_WORKSPACE_NAME,
            ownerUid: legacyOwner?._id || systemDomain?.owner || 1,
            status: 'active',
            legacy: true,
            createdAt: now,
            updatedAt: now,
        };
    }

    static async get(workspaceIdOrCode: string): Promise<WorkspaceDoc | null> {
        const key = normalizeCode(workspaceIdOrCode);
        const stored = await coll.findOne({ $or: [{ _id: key }, { code: key }] });
        if (stored) return stored;
        if (key === LEGACY_WORKSPACE_ID) return WorkspaceModel.getLegacyWorkspace();
        return null;
    }

    static async list(): Promise<WorkspaceDoc[]> {
        const stored = await coll.find().sort({ createdAt: 1, _id: 1 }).toArray();
        if (stored.some((item) => item._id === LEGACY_WORKSPACE_ID)) return stored;
        return [await WorkspaceModel.getLegacyWorkspace(), ...stored];
    }

    static async create(code: string, name: string, ownerUid: number): Promise<WorkspaceDoc> {
        const normalizedCode = normalizeCode(code);
        if (!/^[a-z][a-z0-9-]{2,31}$/.test(normalizedCode) || normalizedCode === LEGACY_WORKSPACE_ID) {
            throw new Error('Invalid workspace code');
        }
        const existing = await WorkspaceModel.get(normalizedCode);
        if (existing) throw new Error('Workspace already exists');
        const now = new Date();
        const workspace: WorkspaceDoc = {
            _id: normalizedCode,
            code: normalizedCode,
            name: name.trim(),
            ownerUid,
            status: 'active',
            createdAt: now,
            updatedAt: now,
        };
        await coll.insertOne(workspace);
        await collMember.updateOne(
            { workspaceId: workspace._id, uid: ownerUid },
            {
                $set: {
                    role: 'owner',
                    status: 'active',
                },
                $setOnInsert: { createdAt: now },
            },
            { upsert: true },
        );
        return workspace;
    }

    static async setStatus(workspaceId: string, status: WorkspaceStatus) {
        return coll.updateOne({ _id: workspaceId }, { $set: { status, updatedAt: new Date() } });
    }

    static async addMember(workspaceId: string, uid: number, role: WorkspaceRole = 'teacher') {
        return collMember.updateOne(
            { workspaceId, uid },
            {
                $set: { role, status: 'active' },
                $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true },
        );
    }

    static async disableMember(workspaceId: string, uid: number) {
        return collMember.updateOne(
            { workspaceId, uid, role: { $ne: 'owner' } },
            { $set: { status: 'disabled' } },
        );
    }

    static async getMember(workspaceId: string, uid: number): Promise<WorkspaceMemberDoc | null> {
        const workspace = await WorkspaceModel.get(workspaceId);
        if (!workspace) return null;
        if (workspace.legacy && uid === workspace.ownerUid) {
            return {
                workspaceId: workspace._id,
                uid,
                role: 'owner',
                status: 'active',
                createdAt: new Date(0),
            };
        }
        return collMember.findOne({ workspaceId: workspace._id, uid, status: 'active' });
    }

    static async getPrimaryForUser(uid: number): Promise<WorkspaceDoc | null> {
        const memberships = await collMember.find({
            uid,
            workspaceId: { $ne: LEGACY_WORKSPACE_ID },
            status: 'active',
        }).sort({ createdAt: 1, workspaceId: 1 }).toArray();
        if (!memberships.length) return null;
        const workspaces = await coll.find({
            _id: { $in: memberships.map((item) => item.workspaceId) },
            status: 'active',
        }).toArray();
        const workspaceMap = new Map(workspaces.map((item) => [item._id, item]));
        return memberships.map((item) => workspaceMap.get(item.workspaceId)).find(Boolean) || null;
    }

    static async getMembers(workspaceId: string): Promise<WorkspaceMemberDoc[]> {
        const workspace = await WorkspaceModel.get(workspaceId);
        if (!workspace) return [];
        if (workspace.legacy) {
            return [{
                workspaceId: workspace._id,
                uid: workspace.ownerUid,
                role: 'owner',
                status: 'active',
                createdAt: new Date(0),
            }];
        }
        return collMember.find({ workspaceId: workspace._id, status: 'active' })
            .sort({ role: 1, createdAt: 1, uid: 1 })
            .toArray();
    }

    static async addStudent(workspaceId: string, uid: number, createdBy: number) {
        return collStudent.updateOne(
            { workspaceId, uid },
            {
                $set: { status: 'active', createdBy },
                $setOnInsert: { joinedAt: new Date() },
            },
            { upsert: true },
        );
    }

    static async disableStudent(workspaceId: string, uid: number) {
        return collStudent.updateOne(
            { workspaceId, uid },
            { $set: { status: 'disabled' } },
        );
    }

    static async getPrimaryForStudent(uid: number): Promise<WorkspaceDoc | null> {
        const students = await collStudent.find({
            uid,
            workspaceId: { $ne: LEGACY_WORKSPACE_ID },
            status: 'active',
        }).sort({ joinedAt: 1, workspaceId: 1 }).toArray();
        if (!students.length) return null;
        const workspaces = await coll.find({
            _id: { $in: students.map((item) => item.workspaceId) },
            status: 'active',
        }).toArray();
        const workspaceMap = new Map(workspaces.map((item) => [item._id, item]));
        return students.map((item) => workspaceMap.get(item.workspaceId)).find(Boolean) || null;
    }

    static async getAssignedWorkspaceIds(uid: number) {
        const [memberWorkspaceIds, studentWorkspaceIds, joinedDomainIds] = await Promise.all([
            collMember.distinct('workspaceId', {
                uid, workspaceId: { $ne: LEGACY_WORKSPACE_ID }, status: 'active',
            }),
            collStudent.distinct('workspaceId', {
                uid, workspaceId: { $ne: LEGACY_WORKSPACE_ID }, status: 'active',
            }),
            domain.collUser.distinct('domainId', { uid, join: true }),
        ]);
        const assignedDomains = joinedDomainIds.length
            ? await domain.coll.find({
                _id: { $in: joinedDomainIds },
                workspaceId: { $exists: true, $ne: LEGACY_WORKSPACE_ID },
            }).project<{ workspaceId?: string }>({ workspaceId: 1 }).toArray()
            : [];
        return Array.from(new Set([
            ...memberWorkspaceIds,
            ...studentWorkspaceIds,
            ...assignedDomains.map((item) => item.workspaceId).filter(Boolean),
        ]));
    }

    static async isAssignedToOtherWorkspace(uid: number, workspaceId: string) {
        return (await WorkspaceModel.getAssignedWorkspaceIds(uid)).some((item) => item !== workspaceId);
    }

    static async getExcludedLegacyUids() {
        const modernDomainIds = await domain.coll.distinct('_id', {
            workspaceId: { $exists: true, $ne: LEGACY_WORKSPACE_ID },
        });
        const [memberUids, studentUids, modernDomainUids] = await Promise.all([
            collMember.distinct('uid', { workspaceId: { $ne: LEGACY_WORKSPACE_ID }, status: 'active' }),
            collStudent.distinct('uid', { workspaceId: { $ne: LEGACY_WORKSPACE_ID }, status: 'active' }),
            modernDomainIds.length
                ? domain.collUser.distinct('uid', {
                    domainId: { $in: modernDomainIds }, uid: { $gt: 1 }, join: true,
                })
                : Promise.resolve([] as number[]),
        ]);
        return new Set([...memberUids, ...studentUids, ...modernDomainUids]);
    }

    static async getDomains(workspaceId: string) {
        return domain.getMulti(WorkspaceModel.getDomainQuery(workspaceId))
            .project<DomainDoc>({ _id: 1, name: 1, owner: 1, avatar: 1, workspaceId: 1 })
            .sort({ _id: 1 })
            .toArray();
    }

    static async getStats(workspaceId: string) {
        const domains = await WorkspaceModel.getDomains(workspaceId);
        const domainIds = domains.map((item) => item._id);
        const [candidateUids, members, excludedLegacyUids] = await Promise.all([
            domainIds.length
                ? domain.collUser.distinct('uid', { domainId: { $in: domainIds }, uid: { $gt: 1 }, join: true })
                : Promise.resolve([] as number[]),
            WorkspaceModel.getMembers(workspaceId),
            workspaceId === LEGACY_WORKSPACE_ID
                ? WorkspaceModel.getExcludedLegacyUids()
                : Promise.resolve(new Set<number>()),
        ]);
        const memberUids = new Set(members.map((item) => item.uid));
        const accounts = candidateUids.length
            ? await collUser.find({ _id: { $in: candidateUids } }).project({ _id: 1, priv: 1 }).toArray()
            : [];
        const studentUids = accounts.filter((item) => (
            (item.priv & PRIV.PRIV_USER_PROFILE)
            && !(item.priv & PRIV.PRIV_EDIT_SYSTEM)
            && !memberUids.has(item._id)
            && !excludedLegacyUids.has(item._id)
        )).map((item) => item._id);
        return {
            domainCount: domains.length,
            studentCount: studentUids.length,
            teacherCount: members.length,
        };
    }
}

export async function apply(_ctx: Context) {
    await Promise.all([
        db.ensureIndexes(
            coll,
            { key: { code: 1 }, name: 'code', unique: true },
            { key: { status: 1, createdAt: 1 }, name: 'status_createdAt' },
        ),
        db.ensureIndexes(
            collMember,
            { key: { workspaceId: 1, uid: 1 }, name: 'workspace_uid', unique: true },
            { key: { uid: 1, status: 1 }, name: 'uid_status' },
        ),
        db.ensureIndexes(
            collStudent,
            { key: { workspaceId: 1, uid: 1 }, name: 'workspace_uid', unique: true },
            { key: { uid: 1, status: 1 }, name: 'uid_status' },
        ),
    ]);
}

export default WorkspaceModel;
global.Hydro.model.workspace = WorkspaceModel;
