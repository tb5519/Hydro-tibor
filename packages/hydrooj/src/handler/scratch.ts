import moment from 'moment-timezone';
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { CsrfTokenError, NotFoundError, PermissionError, ValidationError } from '../error';
import { tryRedirectAsset } from '../lib/asset_delivery';
import { isScratchDomain } from '../lib/domain_type';
import { SCRATCH_MAX_FILE_SIZE } from '../lib/scratch_files';
import { PERM, PRIV } from '../model/builtin';
import domain from '../model/domain';
import * as scratch from '../model/scratch';
import storage from '../model/storage';
import user from '../model/user';
import { Handler } from '../service/server';

function objectId(value: unknown, field: string, optional = false) {
    if (optional && !value) return null;
    if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new ValidationError(field);
    return new ObjectId(value);
}

export class ScratchHandler extends Handler {
    actor: scratch.ScratchActor;

    async prepare() {
        if (!isScratchDomain(this.domain)) throw new NotFoundError('Scratch 域');
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        const isTeacher = this.user.hasPerm(PERM.PERM_EDIT_DOMAIN);
        if (!isTeacher && !await domain.collUser.findOne({ domainId: this.domain._id, uid: this.user._id, join: true })) {
            throw new PermissionError('请先加入该 Scratch 域');
        }
        if (this.request.method.toLowerCase() === 'post') {
            const source = this.request.headers.origin || this.request.headers.referer;
            try {
                if (typeof source !== 'string' || new URL(source).host !== this.request.host) throw new CsrfTokenError();
            } catch {
                throw new CsrfTokenError();
            }
        }
        this.actor = { domainId: this.domain._id, uid: this.user._id, isTeacher };
        this.UiContext.scratch = { domainId: this.domain._id, isTeacher };
        this.response.addHeader('Cache-Control', 'private, no-store');
    }

    routeId(field: string) {
        return objectId(this.request.params[field], field);
    }

    async renderScratch(template: string, body: Record<string, any>) {
        const uids = new Set<number>();
        for (const value of Object.values(body)) {
            for (const doc of Array.isArray(value) ? value : [value]) {
                if (doc?.owner) uids.add(doc.owner);
                if (doc?.reviewer) uids.add(doc.reviewer);
                for (const uid of doc?.recipientIds || []) uids.add(uid);
            }
        }
        this.response.template = template;
        this.response.body = {
            ...body, isTeacher: this.actor.isTeacher, domainId: this.actor.domainId,
            udict: await user.getListForRender(this.actor.domainId, [...uids], this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO)),
        };
    }

    upload(name = 'file', required = true) {
        const file = this.request.files?.[name];
        if (!file || !file.size) {
            if (required) throw new ValidationError(name);
            return undefined;
        }
        if (file.size > SCRATCH_MAX_FILE_SIZE) throw new ValidationError(name, null, '文件不能超过 20 MB。');
        return file;
    }

    assignmentInput(): scratch.AssignmentInput {
        const { title, description, deadline } = this.request.body;
        let parsed: Date = null;
        if (deadline) {
            const time = moment.tz(deadline, 'YYYY-MM-DDTHH:mm', true, this.user.timeZone || 'Asia/Shanghai');
            if (!time.isValid()) throw new ValidationError('deadline');
            parsed = time.toDate();
        }
        return { title, description, deadline: parsed };
    }

    async materialInput() {
        const { title, category, recipientIds, assignmentId } = this.request.body;
        const parts = Array.isArray(recipientIds) ? recipientIds : `${recipientIds || ''}`.split(/[\s,，]+/).filter(Boolean);
        const ids = [...new Set<number>(parts.map((part) => +part))];
        if (ids.some((id) => !Number.isSafeInteger(id) || id < 1) || ids.length > 500) throw new ValidationError('recipientIds');
        if (ids.length) {
            const count = await domain.collUser.countDocuments({ domainId: this.domain._id, uid: { $in: ids }, join: true });
            if (count !== ids.length) throw new ValidationError('recipientIds', null, '接收学生必须是当前域的成员。');
        }
        return { title, category, recipientIds: ids, assignmentId: objectId(assignmentId, 'assignmentId', true) };
    }
}

export class ScratchMainHandler extends ScratchHandler {
    async get() {
        const ownScope = { domainId: this.actor.domainId, owner: this.actor.uid };
        const [assignments, works, submissions, continuationWork] = await Promise.all([
            scratch.listAssignments(this.actor).limit(6).toArray(),
            scratch.listWorks(this.actor).limit(6).toArray(),
            scratch.listSubmissions(this.actor).limit(6).toArray(),
            scratch.works.find({ ...ownScope, currentFileId: { $type: 'objectId' } })
                .sort({ updatedAt: -1, _id: -1 }).limit(1).next(),
        ]);
        const assignmentScope = { ...ownScope, assignmentId: { $in: assignments.map((assignment) => assignment._id) } };
        const [assignmentWorks, latestSubmissions] = assignments.length ? await Promise.all([
            scratch.works.find(assignmentScope).limit(6).toArray(),
            scratch.submissions.aggregate<{ _id: ObjectId, submissionId: ObjectId, reviewedAt: Date | null }>([
                { $match: assignmentScope },
                { $sort: { createdAt: -1, _id: -1 } },
                { $group: { _id: '$assignmentId', submissionId: { $first: '$_id' }, reviewedAt: { $first: '$reviewedAt' } } },
            ]).toArray(),
        ]) : [[], []];
        const assignmentStates = Object.fromEntries(assignments.map((assignment) => {
            const work = assignmentWorks.find((item) => item.assignmentId.equals(assignment._id));
            const submission = latestSubmissions.find((item) => item._id.equals(assignment._id));
            return [assignment._id.toHexString(), {
                workId: work?._id || null,
                hasSavedWork: !!work?.currentFileId,
                submitted: !!submission,
                reviewed: !!submission?.reviewedAt,
                submissionId: submission?.submissionId || null,
            }];
        }));
        await this.renderScratch('scratch_main.html', { assignments, works, submissions, continuationWork, assignmentStates });
    }
}
export class ScratchWorksHandler extends ScratchHandler {
    async get() {
        const page = Math.max(1, Math.floor(+this.request.query.page || 1));
        const [works, numPages, count] = await this.paginate(scratch.listWorks(this.actor), page, 50);
        await this.renderScratch('scratch_works.html', { works, page, numPages, count });
    }

    async post() {
        await this.limitRate('scratch_create', 60, 20);
        const work = this.request.body.materialId
            ? await scratch.createWorkFromMaterial(this.actor, objectId(this.request.body.materialId, 'materialId'), this.request.body.title)
            : await scratch.createWork(this.actor, this.request.body.title);
        this.response.redirect = this.url('scratch_editor', { query: { workId: work._id } });
    }
}
export class ScratchWorkHandler extends ScratchHandler {
    async get() {
        const work = await scratch.getWork(this.actor, this.routeId('workId'));
        const [versions, submissions, assignment] = await Promise.all([
            scratch.versions.find({ domainId: this.domain._id, workId: work._id }).sort({ revision: -1 }).limit(60).toArray(),
            scratch.listSubmissions(this.actor, { workId: work._id }).limit(50).toArray(),
            work.assignmentId ? scratch.getAssignment(this.actor, work.assignmentId) : null,
        ]);
        const submittedRevisions = new Set(submissions.map((submission) => submission.revision));
        await this.renderScratch('scratch_work.html', {
            work, versions: versions.map((version) => ({ ...version, kind: submittedRevisions.has(version.revision) ? 'submission' : 'draft' })),
            submissions, assignment,
        });
    }

    async post() {
        if (this.request.body.operation) return;
        await scratch.renameWork(this.actor, this.routeId('workId'), this.request.body.title);
        this.response.redirect = this.url('scratch_work', { workId: this.routeId('workId') });
    }

    async postDelete() {
        await scratch.deleteWork(this.actor, this.routeId('workId'));
        this.response.redirect = this.url('scratch_works');
    }

    async postRestore() {
        await scratch.restoreVersion(this.actor, this.routeId('workId'),
            objectId(this.request.body.versionId, 'versionId'), +this.request.body.revision);
        this.response.redirect = this.url('scratch_editor', { query: { workId: this.routeId('workId') } });
    }
}
export class ScratchAssignmentsHandler extends ScratchHandler {
    async get() {
        const page = Math.max(1, Math.floor(+this.request.query.page || 1));
        const [assignments, numPages, count] = await this.paginate(scratch.listAssignments(this.actor), page, 30);
        await this.renderScratch('scratch_assignments.html', { assignments, page, numPages, count });
    }
}
export class ScratchAssignmentEditHandler extends ScratchHandler {
    async get() {
        scratch.requireTeacher(this.actor);
        const id = this.request.params.assignmentId ? this.routeId('assignmentId') : null;
        const assignment = id ? await scratch.getAssignment(this.actor, id) : null;
        const deadlineInput = assignment?.deadline
            ? moment(assignment.deadline).tz(this.user.timeZone || 'Asia/Shanghai').format('YYYY-MM-DDTHH:mm') : '';
        await this.renderScratch('scratch_assignment_edit.html', { assignment, deadlineInput, timeZone: this.user.timeZone || 'Asia/Shanghai' });
    }

    async post() {
        scratch.requireTeacher(this.actor);
        await this.limitRate('scratch_assignment', 60, 20);
        const id = this.request.params.assignmentId ? this.routeId('assignmentId') : null;
        const assignment = await scratch.writeAssignment(this.actor, this.assignmentInput(), id, this.upload('template', false));
        this.response.redirect = this.url('scratch_assignment', { assignmentId: assignment._id });
    }
}
export class ScratchAssignmentHandler extends ScratchHandler {
    async get() {
        const assignment = await scratch.getAssignment(this.actor, this.routeId('assignmentId'));
        const [work, works, submissions, materials] = await Promise.all([
            scratch.works.findOne({ domainId: this.domain._id, assignmentId: assignment._id, owner: this.user._id }),
            scratch.listWorks(this.actor, assignment._id).limit(200).toArray(),
            scratch.listSubmissions(this.actor, { assignmentId: assignment._id }).limit(500).toArray(),
            scratch.listMaterials(this.actor, assignment._id).limit(100).toArray(),
        ]);
        await this.renderScratch('scratch_assignment.html', { assignment, work, works, submissions, materials });
    }

    async post() {
        const assignment = await scratch.getAssignment(this.actor, this.routeId('assignmentId'));
        const work = await scratch.createWork(this.actor, assignment.title, assignment._id);
        this.response.redirect = this.url('scratch_editor', { query: { workId: work._id } });
    }
}
export class ScratchMaterialsHandler extends ScratchHandler {
    async get() {
        const [materials, members, assignments] = await Promise.all([
            scratch.listMaterials(this.actor).limit(500).toArray(),
            this.actor.isTeacher
                ? domain.collUser.find({ domainId: this.domain._id, join: true }).project<{ uid: number }>({ uid: 1 }).limit(500).toArray() : [],
            this.actor.isTeacher ? scratch.listAssignments(this.actor).limit(100).toArray() : [],
        ]);
        const students = this.actor.isTeacher
            ? Object.values(await user.getListForRender(this.domain._id, members.map((member) => member.uid), false)) : [];
        await this.renderScratch('scratch_materials.html', { materials, students, assignments });
    }

    async post() {
        scratch.requireTeacher(this.actor);
        await this.limitRate('scratch_material', 60, 20);
        await scratch.writeMaterial(this.actor, await this.materialInput(), this.upload());
        this.response.redirect = this.url('scratch_materials');
    }
}
export class ScratchMaterialHandler extends ScratchHandler {
    async post() {
        if (this.request.body.operation) return;
        scratch.requireTeacher(this.actor);
        await scratch.writeMaterial(this.actor, await this.materialInput(), this.upload('file', false), this.routeId('materialId'));
        this.response.redirect = this.url('scratch_materials');
    }

    async postDelete() {
        await scratch.deleteMaterial(this.actor, this.routeId('materialId'));
        this.response.redirect = this.url('scratch_materials');
    }
}
export class ScratchSubmissionHandler extends ScratchHandler {
    async get() {
        const submission = await scratch.getSubmission(this.actor, this.routeId('submissionId'));
        const [work, assignment] = await Promise.all([
            scratch.getWork(this.actor, submission.workId), scratch.getAssignment(this.actor, submission.assignmentId),
        ]);
        await this.renderScratch('scratch_submission.html', { submission, work, assignment });
    }

    async post() {
        const grade = this.request.body.grade === '' || this.request.body.grade === undefined ? null : `${this.request.body.grade}`.trim();
        await scratch.reviewSubmission(this.actor, this.routeId('submissionId'), grade, `${this.request.body.feedback || ''}`);
        this.response.redirect = this.url('scratch_submission', { submissionId: this.routeId('submissionId') });
    }
}
export class ScratchEditorHandler extends ScratchHandler {
    async get() {
        const query = this.request.query;
        let work: scratch.ScratchWork;
        let submission: scratch.ScratchSubmission;
        if (query.submissionId) {
            submission = await scratch.getSubmission(this.actor, objectId(query.submissionId, 'submissionId'));
            work = await scratch.getWork(this.actor, submission.workId);
        } else if (query.workId) work = await scratch.getWork(this.actor, objectId(query.workId, 'workId'));
        else if (query.assignmentId) {
            const assignment = await scratch.getAssignment(this.actor, objectId(query.assignmentId, 'assignmentId'));
            work = await scratch.works.findOne({ domainId: this.domain._id, assignmentId: assignment._id, owner: this.user._id });
            if (!work) {
                this.response.redirect = this.url('scratch_assignment', { assignmentId: assignment._id });
                return;
            }
        } else {
            this.response.redirect = this.url('scratch_works');
            return;
        }
        const assignment = work.assignmentId ? await scratch.getAssignment(this.actor, work.assignmentId) : null;
        const readOnly = !!submission || work.owner !== this.user._id || query.readOnly === 'true' || query.readonly === 'true';
        const fileId = submission?.fileId || work.currentFileId || assignment?.templateFileId;
        this.UiContext.scratchEditor = {
            workId: work._id.toHexString(), title: work.title, projectUrl: fileId ? this.url('scratch_file', { fileId }) : null,
            saveUrl: readOnly ? null : this.url('scratch_save', { workId: work._id }),
            backUrl: submission ? this.url('scratch_submission', { submissionId: submission._id }) : this.url('scratch_work', { workId: work._id }),
            canSubmit: !readOnly && !!assignment && (!assignment.deadline || assignment.deadline.getTime() >= Date.now()),
            readOnly, revision: work.revision, maxFileSize: SCRATCH_MAX_FILE_SIZE,
        };
        await this.renderScratch('scratch_editor.html', { work, assignment, submission });
    }
}
export class ScratchSaveHandler extends ScratchHandler {
    async post() {
        await this.limitRate('scratch_save', 60, 12);
        const submit = this.request.body.submit;
        if (submit !== undefined && !['true', 'false', true, false].includes(submit)) throw new ValidationError('submit');
        const { work, submission } = await scratch.saveWork(this.actor, this.routeId('workId'), +this.request.body.revision,
            this.upload(), submit === 'true' || submit === true, this.request.body.title, this.request.body.thumbnail);
        this.response.body = {
            ok: true, workId: work._id.toHexString(), revision: work.revision, title: work.title,
            projectUrl: this.url('scratch_file', { fileId: work.currentFileId }),
            ...(submission ? { submissionId: submission._id.toHexString() } : {}),
        };
        this.response.type = 'application/json';
        if (!this.request.json && !`${this.request.headers.accept || ''}`.includes('application/json')) {
            this.response.redirect = this.url('scratch_work', { workId: work._id });
        }
    }
}
export class ScratchThumbnailHandler extends ScratchHandler {
    async get() {
        const work = await scratch.getWork(this.actor, this.routeId('workId'));
        const assignment = work.assignmentId ? await scratch.getAssignment(this.actor, work.assignmentId) : null;
        const fileId = work.currentFileId || assignment?.templateFileId;
        this.response.type = 'application/json';
        this.response.body = {
            title: work.title, revision: work.revision,
            thumbnailUrl: work.thumbnailFileId ? this.url('scratch_file', { fileId: work.thumbnailFileId }) : null,
            projectUrl: fileId ? this.url('scratch_file', { fileId }) : null,
            canCache: work.owner === this.user._id && (!work.assignmentId || !!work.currentFileId), maxFileSize: SCRATCH_MAX_FILE_SIZE,
        };
    }

    async post() {
        await this.limitRate('scratch_thumbnail', 60, 60);
        const fileId = await scratch.cacheWorkThumbnail(this.actor, this.routeId('workId'),
            +this.request.body.revision, this.request.body.thumbnail);
        this.response.type = 'application/json';
        this.response.body = { ok: true, thumbnailUrl: this.url('scratch_file', { fileId }) };
    }
}
export class ScratchShareCreateHandler extends ScratchHandler {
    async post() {
        if (this.request.body.operation) return;
        await this.limitRate('scratch_share', 60, 30);
        const share = await scratch.shareWork(this.actor, this.routeId('workId'));
        this.response.type = 'application/json';
        this.response.body = { ok: true, url: this.url('scratch_share', { token: share._id }), title: share.title, revision: share.revision };
    }

    async postRevoke() {
        await this.limitRate('scratch_share', 60, 30);
        await scratch.revokeWorkShares(this.actor, this.routeId('workId'));
        this.response.type = 'application/json';
        this.response.body = { ok: true, revoked: true };
    }
}

export class ScratchShareHandler extends Handler {
    noCheckPermView = true;
    shared: Awaited<ReturnType<typeof scratch.getPublicShare>>;

    publicHeaders() {
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        this.response.addHeader('Referrer-Policy', 'no-referrer');
        this.response.addHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }

    async prepare() {
        this.publicHeaders();
        if (!isScratchDomain(this.domain)) throw new NotFoundError('分享作品');
        this.shared = await scratch.getPublicShare(this.domain._id, this.request.params.token);
    }

    async get() {
        const { share } = this.shared;
        this.UiContext.scratchPlayer = {
            title: share.title, projectUrl: this.url('scratch_share_project', { token: share._id }), maxFileSize: SCRATCH_MAX_FILE_SIZE,
        };
        this.response.template = 'scratch_share.html';
        const publicMetadata = { title: share.title, revision: share.revision };
        // An explicit response type keeps the framework's X-Hydro-Inject and
        // noTemplate serialization paths away from private domain/user context.
        if (this.request.json || this.args.noTemplate) {
            this.response.type = 'application/json';
            this.response.body = publicMetadata;
        } else {
            this.response.type = 'text/html';
            this.response.body = await this.renderHTML('scratch_share.html', publicMetadata);
        }
    }

    async head() {
        this.response.type = 'text/html';
        this.response.body = '';
        // The framework intentionally ignores falsey bodies when committing a
        // response, so an empty HEAD must set Koa's status/type directly.
        this.context.status = 200;
        this.context.type = this.response.type;
    }

    async onerror(error: any) {
        this.publicHeaders();
        const code = error instanceof NotFoundError ? 404 : error?.code;
        this.response.status = Number.isInteger(code) && code >= 400 && code <= 599 ? code : 500;
        this.response.type = 'application/json';
        this.response.template = null;
        this.response.redirect = null;
        const message = this.response.status === 404 ? '分享链接已失效或不存在。' : '暂时无法打开分享作品。';
        this.response.body = { error: { message } };
        if (!this.request.json && !this.args?.noTemplate && this.request.method !== 'head' && !this.request.path?.endsWith('/project')) {
            try {
                this.response.body = await this.renderHTML('scratch_share_error.html', { message });
                this.response.type = 'text/html';
            } catch {
                // Keep the safe JSON fallback if the standalone error template
                // is unavailable; never render the private site's error layout.
            }
        }
    }
}

export class ScratchShareProjectHandler extends ScratchShareHandler {
    async get() {
        this.response.type = 'application/octet-stream';
        this.response.addHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        const meta = await storage.getMeta(this.shared.file.path);
        const source = scratch.fileAssetSource(this.shared.file, meta?.remoteAsset);
        if (source && tryRedirectAsset(this, source)) return;
        this.response.attachment('project.sb3', await storage.get(this.shared.file.path));
    }

    async head() {
        await super.head();
        this.response.type = 'application/octet-stream';
        this.context.type = this.response.type;
        this.response.addHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        this.response.addHeader('Content-Length', this.shared.file.size.toString());
    }
}
export class ScratchFileHandler extends ScratchHandler {
    async get() {
        const file = await scratch.getFile(this.actor, this.routeId('fileId'));
        // getFile has already checked work ownership / material recipients.
        // The CDN object is private and this route only issues a short-lived URL.
        const meta = await storage.getMeta(file.path);
        const source = scratch.fileAssetSource(file, meta?.remoteAsset);
        if (source && tryRedirectAsset(this, source)) return;
        if (file.purpose === 'thumbnail') {
            this.response.body = await storage.get(file.path);
            this.response.type = 'image/png';
            this.response.addHeader('X-Content-Type-Options', 'nosniff');
            return;
        }
        this.response.attachment(file.filename, await storage.get(file.path));
        // Even a mislabeled user upload cannot become active same-origin content.
        this.response.type = 'application/octet-stream';
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        this.response.addHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }
}

export async function apply(ctx: Context) {
    ctx.Route('scratch_main', '/scratch', ScratchMainHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_works', '/scratch/works', ScratchWorksHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_work', '/scratch/work/:workId', ScratchWorkHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_save', '/scratch/work/:workId/save', ScratchSaveHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_assignments', '/scratch/assignments', ScratchAssignmentsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_assignment_create', '/scratch/assignment/create', ScratchAssignmentEditHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_assignment_edit', '/scratch/assignment/:assignmentId/edit', ScratchAssignmentEditHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_assignment', '/scratch/assignment/:assignmentId', ScratchAssignmentHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_materials', '/scratch/materials', ScratchMaterialsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_material', '/scratch/material/:materialId', ScratchMaterialHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_submission', '/scratch/submission/:submissionId', ScratchSubmissionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_editor', '/scratch/editor', ScratchEditorHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_thumbnail', '/scratch/work/:workId/thumbnail', ScratchThumbnailHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_share_create', '/scratch/work/:workId/share', ScratchShareCreateHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_share', '/scratch/share/:token', ScratchShareHandler);
    ctx.Route('scratch_share_project', '/scratch/share/:token/project', ScratchShareProjectHandler);
    ctx.Route('scratch_file', '/scratch/file/:fileId', ScratchFileHandler, PRIV.PRIV_USER_PROFILE);
}
