import { lookup } from 'mime-types';
import moment from 'moment-timezone';
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { CsrfTokenError, NotFoundError, PermissionError, ValidationError } from '../error';
import { tryRedirectAsset } from '../lib/asset_delivery';
import { isScratchDomain } from '../lib/domain_type';
import { getScratchEditorVersion } from '../lib/scratch_editor_assets';
import { SCRATCH_MAX_FILE_SIZE } from '../lib/scratch_files';
import { PERM, PRIV } from '../model/builtin';
import domain from '../model/domain';
import * as scratch from '../model/scratch';
import * as scratchObjective from '../model/scratch_objective';
import storage from '../model/storage';
import user from '../model/user';
import { Handler } from '../service/server';

function objectId(value: unknown, field: string, optional = false) {
    if (optional && !value) return null;
    if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new ValidationError(field);
    return new ObjectId(value);
}

// Keep this list in sync with the pinned @turbowarp/scratch-l10n
// src/supported-locales.js used by build/scratch. Locale keys are case-sensitive.
const SCRATCH_EDITOR_LOCALES = new Set([
    'ab', 'af', 'ar', 'am', 'an', 'ast', 'az', 'id', 'bn', 'be', 'bg', 'ca', 'cs', 'cy', 'da', 'de',
    'et', 'el', 'en', 'es', 'es-419', 'eo', 'eu', 'fa', 'fil', 'fr', 'fy', 'ga', 'gd', 'gl', 'ko',
    'ha', 'hy', 'he', 'hi', 'hr', 'xh', 'zu', 'is', 'it', 'ka', 'kk', 'qu', 'sw', 'ht', 'ku', 'ckb',
    'lv', 'lt', 'hu', 'mi', 'mn', 'nl', 'ja', 'ja-Hira', 'nb', 'nn', 'oc', 'or', 'uz', 'th', 'km',
    'pl', 'pt', 'pt-br', 'rap', 'ro', 'ru', 'nso', 'tn', 'sk', 'sl', 'sr', 'fi', 'sv', 'vi', 'tr',
    'uk', 'zh-cn', 'zh-tw',
]);
const DEFAULT_SCRATCH_EDITOR_LOCALE = 'zh-cn';

export class ScratchHandler extends Handler {
    actor: scratch.ScratchActor;

    async prepare() {
        if (!isScratchDomain(this.domain)) throw new NotFoundError('Scratch 域');
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        const isTeacher = this.user.hasPerm(PERM.PERM_EDIT_DOMAIN);
        if (!isTeacher && !await domain.collUser.findOne({
            domainId: this.domain._id, uid: this.user._id, join: true, blockedByStudentManagement: { $ne: true },
        })) {
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
        this.UiContext.scratch = { domainId: this.domain._id, isTeacher, editorVersion: getScratchEditorVersion() };
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
        const publicDoc = (doc: any) => (doc?.objectiveQuiz?.items ? { ...doc, objectiveQuiz: {
            paperIds: doc.objectiveQuiz.paperIds, total: doc.objectiveQuiz.items.length,
        } } : doc);
        const publicBody = Object.fromEntries(Object.entries(body).map(([key, value]) => [key,
            Array.isArray(value) ? value.map(publicDoc) : publicDoc(value)]));
        this.response.template = template;
        this.response.body = {
            ...publicBody, isTeacher: this.actor.isTeacher, domainId: this.actor.domainId,
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
        const { projectRequired, objectivePaperIds, assignmentMode } = this.request.body;
        if (assignmentMode !== undefined && !['project', 'objective', 'mixed'].includes(assignmentMode)) throw new ValidationError('assignmentMode');
        if (projectRequired !== undefined && ![true, false, 'true', 'false', '1', '0'].includes(projectRequired)) {
            throw new ValidationError('projectRequired');
        }
        if (assignmentMode) {
            const ids = assignmentMode === 'project' ? [] : scratchObjective.parsePaperIds(objectivePaperIds);
            if (assignmentMode !== 'project' && !ids.length) throw new ValidationError('objectivePaperIds', null, '请先选择一套客观题');
            return { title, description, deadline: parsed, projectRequired: assignmentMode !== 'objective', objectivePaperIds: ids };
        }
        return {
            title, description, deadline: parsed,
            ...(projectRequired !== undefined ? { projectRequired: [true, 'true', '1'].includes(projectRequired) } : {}),
            ...(objectivePaperIds !== undefined ? { objectivePaperIds: scratchObjective.parsePaperIds(objectivePaperIds) } : {}),
        };
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
        const ownerQuery = this.request.query.owner;
        let selectedOwner: number = null;
        if (ownerQuery !== undefined && ownerQuery !== '') {
            if (typeof ownerQuery !== 'string' || !/^[1-9]\d*$/.test(ownerQuery)) throw new ValidationError('owner');
            selectedOwner = +ownerQuery;
            if (!Number.isSafeInteger(selectedOwner) || selectedOwner < 1) throw new ValidationError('owner');
            if (!this.actor.isTeacher && selectedOwner !== this.actor.uid) throw new PermissionError('Scratch 作品访问');
            if (this.actor.isTeacher && selectedOwner !== this.actor.uid
                && !await domain.collUser.findOne({ domainId: this.domain._id, uid: selectedOwner, join: true })) {
                throw new ValidationError('owner', null, '请选择当前域的学员。');
            }
        }
        const [works, numPages, count] = await this.paginate(scratch.listWorks(this.actor, undefined, selectedOwner), page, 50);
        let studentOptions: { uid: number, uname: string }[] = [];
        if (this.actor.isTeacher) {
            const owners = await scratch.works.distinct('owner', { domainId: this.domain._id });
            const members = await domain.collUser.find({ domainId: this.domain._id, uid: { $in: owners }, join: true })
                .project<{ uid: number }>({ uid: 1 }).toArray();
            const ids = members.map((member) => member.uid);
            if (owners.includes(this.actor.uid) && !ids.includes(this.actor.uid)) ids.push(this.actor.uid);
            const names = await user.getListForRender(this.domain._id, ids, false);
            studentOptions = ids.map((uid) => ({ uid, uname: names[uid]?.displayName || names[uid]?.uname || String(uid) }))
                .sort((a, b) => a.uname.localeCompare(b.uname, 'zh-CN'));
        }
        await this.renderScratch('scratch_works.html', { works, page, numPages, count, studentOptions, selectedOwner });
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
    wantsJson() {
        return this.request.json || `${this.request.headers.accept || ''}`.includes('application/json');
    }

    async get() {
        const work = await scratch.getWork(this.actor, this.routeId('workId'));
        const [submissions, assignment] = await Promise.all([
            scratch.listSubmissions(this.actor, { workId: work._id }).limit(50).toArray(),
            work.assignmentId ? scratch.getAssignment(this.actor, work.assignmentId) : null,
        ]);
        await this.renderScratch('scratch_work.html', { work, submissions, assignment });
    }

    async post() {
        if (this.request.body.operation) return;
        const workId = this.routeId('workId');
        await scratch.renameWork(this.actor, workId, this.request.body.title);
        if (this.wantsJson()) {
            this.response.type = 'application/json';
            this.response.body = { ok: true, workId: workId.toHexString(), title: `${this.request.body.title}`.trim() };
        } else this.response.redirect = this.url('scratch_work', { workId });
    }

    async postCopy() {
        const work = await scratch.copyWork(this.actor, this.routeId('workId'));
        if (this.wantsJson()) {
            this.response.type = 'application/json';
            this.response.body = { ok: true, workId: work._id.toHexString(), title: work.title };
        } else this.response.redirect = this.url('scratch_editor', { query: { workId: work._id } });
    }

    async postDelete() {
        await scratch.deleteWork(this.actor, this.routeId('workId'));
        if (this.wantsJson()) {
            this.response.type = 'application/json';
            this.response.body = { ok: true };
        } else this.response.redirect = this.url('scratch_works');
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
        const objectivePapers = await scratchObjective.listPapers(this.actor);
        const selectedPaper = Number(this.request.query.objectivePaperId);
        await this.renderScratch('scratch_assignment_edit.html', {
            assignment, deadlineInput, timeZone: this.user.timeZone || 'Asia/Shanghai',
            objectivePapers,
            selectedObjectivePaperIds: !assignment && objectivePapers.some((paper) => paper.docId === selectedPaper) ? [selectedPaper] : null,
        });
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
        const quizUrl = (uid?: number) => this.url('scratch_objective_quiz', { assignmentId: assignment._id, query: uid ? { uid } : {} });
        const quizState = assignment.objectiveQuiz ? await scratchObjective.getState(this.actor, assignment) : null;
        const objectiveQuiz = quizState ? {
            total: quizState.total, answered: quizState.answered, correct: quizState.correct, score: quizState.score,
            totalScore: quizState.totalScore, completed: quizState.completed, url: quizUrl(),
        } : null;
        const objectiveResults = this.actor.isTeacher ? (await scratchObjective.getResults(this.actor, assignment))
            .map((item) => ({ ...item, url: quizUrl(item.uid) })) : [];
        // Assignment JSON is a public page contract; never expose stored answer keys in the snapshot.
        const publicAssignment = { ...assignment, objectiveQuiz: assignment.objectiveQuiz ? {
            paperIds: assignment.objectiveQuiz.paperIds, total: assignment.objectiveQuiz.items.length,
        } : null };
        await this.renderScratch('scratch_assignment.html', {
            assignment: publicAssignment, work, works, submissions, materials, objectiveQuiz, objectiveResults,
        });
    }

    async post() {
        const assignment = await scratch.getAssignment(this.actor, this.routeId('assignmentId'));
        const work = await scratch.createWork(this.actor, assignment.title, assignment._id);
        this.response.redirect = this.url('scratch_editor', { query: { workId: work._id } });
    }
}
export class ScratchObjectiveQuizHandler extends ScratchHandler {
    async state() {
        const assignment = await scratch.getAssignment(this.actor, this.routeId('assignmentId'));
        const uid = this.request.query.uid ? Number(this.request.query.uid) : this.actor.uid;
        if (!Number.isSafeInteger(uid) || uid < 1) throw new ValidationError('uid');
        const state = await scratchObjective.getState(this.actor, assignment, uid,
            (filename) => this.url('scratch_objective_file', { assignmentId: assignment._id, filename }));
        const student = await user.getById(this.actor.domainId, uid);
        return { ...state, studentName: student?.displayName || student?.uname || `${uid}`,
            actionUrl: this.url('scratch_objective_quiz', { assignmentId: assignment._id }),
            backUrl: this.url('scratch_assignment', { assignmentId: assignment._id }) };
    }

    async get() {
        const scratchObjectiveQuiz = await this.state();
        this.UiContext.scratchObjectiveQuiz = scratchObjectiveQuiz;
        await this.renderScratch('scratch_objective_quiz.html', { scratchObjectiveQuiz });
    }

    async postAnswer() {
        await this.limitRate('scratch_objective_answer', 60, 120);
        const assignment = await scratch.getAssignment(this.actor, this.routeId('assignmentId'));
        if (typeof this.request.body.revision !== 'string') throw new ValidationError('revision');
        await scratchObjective.answer(this.actor, assignment, this.request.body.questionId, this.request.body.answers, this.request.body.revision);
        this.response.body = { state: await this.state() };
    }
}

export class ScratchObjectiveFileHandler extends ScratchHandler {
    async get() {
        const assignment = await scratch.getAssignment(this.actor, this.routeId('assignmentId'));
        const filename = this.request.params.filename;
        const target = await scratchObjective.getFile(this.actor, assignment, filename);
        this.response.body = await storage.get(target);
        this.response.type = lookup(filename) || 'application/octet-stream';
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        if (!/\.(?:png|jpe?g|gif|webp|avif)$/i.test(filename)) this.response.disposition = `attachment; filename="${encodeURIComponent(filename)}"`;
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
        const readOnly = !!submission || (work.owner !== this.user._id && !this.actor.isTeacher)
            || query.readOnly === 'true' || query.readonly === 'true';
        const saveForStudent = !readOnly && this.actor.isTeacher && work.owner !== this.user._id;
        const ownerDict = saveForStudent ? await user.getListForRender(this.domain._id, [work.owner], false) : null;
        const ownerName = ownerDict?.[work.owner]?.displayName || ownerDict?.[work.owner]?.uname || String(work.owner);
        const fileId = submission?.fileId || work.currentFileId || assignment?.templateFileId;
        // Assign each editable page a server-ordered generation. A delayed request
        // from an older tab cannot replace a choice already saved by a newer tab.
        const ownerPreference = readOnly
            ? await user.coll.findOne({ _id: work.owner }, { projection: { scratchEditorLocale: 1 } })
            : await user.coll.findOneAndUpdate({ _id: work.owner },
                { $inc: { scratchEditorLocaleSessionCounter: 1 } },
                { returnDocument: 'after', projection: { scratchEditorLocale: 1, scratchEditorLocaleSessionCounter: 1 } });
        const locale = ownerPreference?.scratchEditorLocale;
        this.UiContext.scratchEditor = {
            editorVersion: getScratchEditorVersion(),
            workId: work._id.toHexString(), title: work.title, projectUrl: fileId ? this.url('scratch_file', { fileId }) : null,
            saveUrl: readOnly ? null : this.url('scratch_save', { workId: work._id }),
            locale: SCRATCH_EDITOR_LOCALES.has(locale) ? locale : DEFAULT_SCRATCH_EDITOR_LOCALE,
            languageUrl: readOnly || !ownerPreference ? null : this.url('scratch_language', { workId: work._id }),
            languageGeneration: ownerPreference?.scratchEditorLocaleSessionCounter || null,
            libraryUrl: readOnly ? null : this.url('scratch_library'),
            backUrl: submission ? this.url('scratch_submission', { submissionId: submission._id }) : this.url('scratch_work', { workId: work._id }),
            canSubmit: !readOnly && !saveForStudent && !!assignment && (!assignment.deadline || assignment.deadline.getTime() >= Date.now()),
            readOnly, saveForStudent, ownerName, revision: work.revision, maxFileSize: SCRATCH_MAX_FILE_SIZE,
        };
        await this.renderScratch('scratch_editor.html', { work, assignment, submission });
    }
}
export class ScratchLanguageHandler extends ScratchHandler {
    async post() {
        await this.limitRate('scratch_language', 60, 60);
        const { locale, session, generation: rawGeneration, sequence: rawSequence } = this.request.body;
        if (typeof locale !== 'string' || !SCRATCH_EDITOR_LOCALES.has(locale)) throw new ValidationError('locale');
        if (typeof session !== 'string'
            || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session)) {
            throw new ValidationError('session');
        }
        if (typeof rawSequence !== 'number' && (typeof rawSequence !== 'string' || !/^[1-9]\d*$/.test(rawSequence))) {
            throw new ValidationError('sequence');
        }
        const sequence = Number(rawSequence);
        if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 1_000_000_000) throw new ValidationError('sequence');
        if (typeof rawGeneration !== 'number'
            && (typeof rawGeneration !== 'string' || !/^[1-9]\d*$/.test(rawGeneration))) {
            throw new ValidationError('generation');
        }
        const generation = Number(rawGeneration);
        if (!Number.isSafeInteger(generation) || generation < 1 || generation > 1_000_000_000) {
            throw new ValidationError('generation');
        }
        const work = await scratch.getWork(this.actor, this.routeId('workId'));
        const updated = await user.coll.findOneAndUpdate({
            _id: work.owner,
            scratchEditorLocaleSessionCounter: { $gte: generation },
            $or: [
                { 'scratchEditorLocaleRevision.generation': { $exists: false } },
                { 'scratchEditorLocaleRevision.generation': { $lt: generation } },
                { 'scratchEditorLocaleRevision.generation': generation,
                    'scratchEditorLocaleRevision.session': session,
                    'scratchEditorLocaleRevision.sequence': { $lt: sequence } },
            ],
        }, {
            $set: { scratchEditorLocale: locale, scratchEditorLocaleRevision: { session, generation, sequence } },
        }, { returnDocument: 'after', projection: { scratchEditorLocale: 1 } });
        const current = updated || await user.coll.findOne({ _id: work.owner }, { projection: { scratchEditorLocale: 1 } });
        if (!current) throw new NotFoundError('Scratch 作品作者');
        this.response.body = {
            ok: true, accepted: !!updated,
            locale: SCRATCH_EDITOR_LOCALES.has(current.scratchEditorLocale)
                ? current.scratchEditorLocale : DEFAULT_SCRATCH_EDITOR_LOCALE,
        };
        this.response.type = 'application/json';
    }
}
export class ScratchSaveHandler extends ScratchHandler {
    async post() {
        await this.limitRate('scratch_save', 60, 12);
        const submit = this.request.body.submit;
        if (submit !== undefined && !['true', 'false', true, false].includes(submit)) throw new ValidationError('submit');
        const teacherSave = this.request.body.teacherSave;
        if (teacherSave !== undefined && !['true', 'false', true, false].includes(teacherSave)) throw new ValidationError('teacherSave');
        const { work, submission } = await scratch.saveWork(this.actor, this.routeId('workId'), +this.request.body.revision,
            this.upload(), submit === 'true' || submit === true, this.request.body.title, this.request.body.thumbnail,
            teacherSave === 'true' || teacherSave === true);
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
export class ScratchCommunityHandler extends ScratchHandler {
    async get() {
        const rawPage = this.request.query.page;
        const page = rawPage === undefined ? 1 : +rawPage;
        if ((rawPage !== undefined && typeof rawPage !== 'string') || !Number.isSafeInteger(page) || page < 1) {
            throw new ValidationError('page');
        }
        const query = this.request.query.q;
        if (query !== undefined && typeof query !== 'string') throw new ValidationError('q');
        const q = scratch.cleanText(query, 'q', 80, ' ').trim();
        const mine = ['1', 'true'].includes(`${this.request.query.mine || ''}`);
        const favorites = ['1', 'true'].includes(`${this.request.query.favorites || ''}`);
        if (mine && favorites) throw new ValidationError('favorites');
        const sort = this.request.query.sort ?? (favorites ? 'saved' : 'hot');
        if (typeof sort !== 'string' || !['hot', 'latest', ...(favorites ? ['saved'] : [])].includes(sort)) throw new ValidationError('sort');
        const { communityWorks, pcount, count } = await scratch.pageCommunityWorks(this.actor, q, mine, sort, page, 24, favorites);
        await this.renderScratch('scratch_community.html', { communityWorks, page, pcount, count, q, mine, favorites, sort });
    }
}

export class ScratchCommunityPublishHandler extends ScratchHandler {
    async get() {
        const { work, publication } = await scratch.getWorkCommunityPublication(this.actor, this.routeId('workId'));
        this.response.type = 'application/json';
        this.response.body = { ok: true, title: work.title, revision: work.revision,
            thumbnailUrl: work.thumbnailFileId ? this.url('scratch_file', { fileId: work.thumbnailFileId }) : null,
            publication: publication ? { id: publication._id.toHexString(), title: publication.title,
                instructions: publication.instructions, revision: publication.revision,
                url: this.url('scratch_community_work', { communityId: publication._id }) } : null };
    }

    async post() {
        await this.limitRate('scratch_community_publish', 60, 30);
        const { publication, updated } = await scratch.publishCommunityWork(this.actor, this.routeId('workId'), this.request.body.instructions ?? '');
        this.response.type = 'application/json';
        this.response.body = { ok: true, id: publication._id.toHexString(), title: publication.title, revision: publication.revision, updated,
            url: this.url('scratch_community_work', { communityId: publication._id }) };
    }
}

export class ScratchCommunityWorkHandler extends ScratchHandler {
    async get() {
        const communityWork = await scratch.getCommunityWork(this.actor, this.routeId('communityId'));
        const isOwner = communityWork.owner === this.actor.uid;
        const canEdit = isOwner && !!await scratch.works.findOne({ domainId: this.actor.domainId,
            _id: communityWork.workId, owner: this.actor.uid });
        const projectConfig = { editorVersion: getScratchEditorVersion(), title: communityWork.title,
            projectUrl: this.url('scratch_community_project', { communityId: communityWork._id }),
            metricsUrl: this.url('scratch_community_metrics', { communityId: communityWork._id }),
            stateUrl: this.url('scratch_community_state', { communityId: communityWork._id }),
            stateFileId: communityWork.fileId.toHexString(),
            maxFileSize: SCRATCH_MAX_FILE_SIZE, memberOnly: true };
        this.UiContext.scratchPlayer = projectConfig;
        const communityMetrics = await scratch.getCommunityMetrics(this.actor, communityWork._id);
        await this.renderScratch('scratch_community_detail.html', { communityWork, projectConfig, communityMetrics,
            isOwner, canManage: isOwner || this.actor.isTeacher, canEdit });
    }

    async postUnpublish() {
        await this.limitRate('scratch_community_publish', 60, 30);
        await scratch.unpublishCommunityWork(this.actor, this.routeId('communityId'));
        this.response.type = 'application/json';
        this.response.body = { ok: true, url: this.url('scratch_community') };
    }
}

export class ScratchCommunityMetricsHandler extends ScratchHandler {
    async get() {
        this.response.type = 'application/json';
        this.response.body = await scratch.getCommunityMetrics(this.actor, this.routeId('communityId'));
    }

    async postLike() {
        await this.limitRate('scratch_community_like', 60, 120);
        this.response.type = 'application/json';
        this.response.body = await scratch.likeCommunityWork(this.actor, this.routeId('communityId'), this.request.body.requestId);
    }

    async postFavorite() {
        await this.limitRate('scratch_community_favorite', 60, 120);
        this.response.type = 'application/json';
        const { favorited, requestId, favoriteRevision } = this.request.body;
        this.response.body = await scratch.favoriteCommunityWork(this.actor, this.routeId('communityId'), favorited, requestId, favoriteRevision);
    }

    async postRuntimeStart() {
        await this.limitRate('scratch_community_runtime_start', 60, 120);
        this.response.type = 'application/json';
        this.response.body = await scratch.startCommunityRuntime(this.actor, this.routeId('communityId'), this.request.body.requestId);
    }

    async postRuntimeHeartbeat() {
        await this.limitRate('scratch_community_runtime_heartbeat', 60, 120);
        const { sessionId, seq, seconds } = this.request.body;
        this.response.type = 'application/json';
        this.response.body = await scratch.heartbeatCommunityRuntime(this.actor, this.routeId('communityId'), sessionId, seq, seconds);
    }
}

export class ScratchCommunityStateHandler extends ScratchHandler {
    async get() {
        this.response.type = 'application/json';
        this.response.body = await scratch.getCommunityState(this.actor, this.routeId('communityId'));
    }

    async postSync() {
        await this.limitRate('scratch_community_state', 60, 180);
        this.response.type = 'application/json';
        this.response.body = await scratch.syncCommunityState(this.actor, this.routeId('communityId'), this.request.body);
    }
}

export class ScratchCommunityAnalyticsHandler extends ScratchHandler {
    async get() {
        const analytics = await scratch.getCommunityAnalytics(this.actor, this.routeId('communityId'));
        const names = await user.getListForRender(this.actor.domainId, analytics.participants.map((row) => row.uid), false);
        this.response.type = 'application/json';
        this.response.body = { ...analytics, participants: analytics.participants.map((row) => ({ ...row,
            name: names[row.uid]?.displayName || names[row.uid]?.uname || `课堂成员 ${row.uid}` })) };
    }

    async postAdjust() {
        await this.limitRate('scratch_community_adjust', 60, 120);
        const { requestId, likes, runtimeSeconds, favorites = 0 } = this.request.body;
        await scratch.adjustCommunityMetrics(this.actor, this.routeId('communityId'), requestId, likes, runtimeSeconds, favorites);
        await this.get();
    }
}

export class ScratchCommunityProjectHandler extends ScratchHandler {
    thumbnail = false;

    private fileHeaders(file: scratch.ScratchFile) {
        this.response.type = this.thumbnail ? 'image/png' : 'application/octet-stream';
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        // Browsers may retain the immutable bytes, but every reuse must pass
        // classroom membership and publication checks before revalidation.
        this.response.addHeader('Cache-Control', 'private, no-cache');
        this.response.addHeader('Vary', 'Cookie, Authorization');
        this.response.addHeader('ETag', `"${file._id.toHexString()}"`);
        if (!this.thumbnail) this.response.addHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }

    private notModified(file: scratch.ScratchFile) {
        const etag = `"${file._id.toHexString()}"`;
        const condition = this.request.headers?.['if-none-match'];
        if (typeof condition !== 'string' || !condition.split(',').some((value) => {
            const tag = value.trim().replace(/^W\//, '');
            return tag === etag || tag === '*';
        })) return false;
        // Do not use response.etag: the generic response layer changes that
        // property to a public cache policy. This route always stays private.
        this.response.status = 304;
        this.response.body = '';
        this.context.status = 304;
        return true;
    }

    async get() {
        const file = await scratch.getCommunityFile(this.actor, this.routeId('communityId'), this.thumbnail);
        this.fileHeaders(file);
        if (this.notModified(file)) return;
        // Membership was checked by prepare(), and the publication and its
        // snapshot are still present. Reuse the same short-lived, signed media
        // delivery as private Scratch files; never create a public share token.
        const meta = await storage.getMeta(file.path);
        const source = scratch.fileAssetSource(file, meta?.remoteAsset);
        if (source && tryRedirectAsset(this, source)) return;
        this.response.addHeader('Content-Length', file.size.toString());
        if (this.thumbnail) this.response.body = await storage.get(file.path);
        else this.response.attachment('project.sb3', await storage.get(file.path));
    }

    async head() {
        const file = await scratch.getCommunityFile(this.actor, this.routeId('communityId'), this.thumbnail);
        this.fileHeaders(file);
        if (this.notModified(file)) return;
        this.response.body = '';
        this.response.addHeader('Content-Length', file.size.toString());
        this.context.status = 200;
        this.context.type = this.response.type;
    }
}

export class ScratchCommunityThumbnailHandler extends ScratchCommunityProjectHandler {
    thumbnail = true;
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
            editorVersion: getScratchEditorVersion(),
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
    ctx.Route('scratch_language', '/scratch/work/:workId/language', ScratchLanguageHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_assignments', '/scratch/assignments', ScratchAssignmentsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_assignment_create', '/scratch/assignment/create', ScratchAssignmentEditHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_assignment_edit', '/scratch/assignment/:assignmentId/edit', ScratchAssignmentEditHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_assignment', '/scratch/assignment/:assignmentId', ScratchAssignmentHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_objective_quiz', '/scratch/assignment/:assignmentId/quiz', ScratchObjectiveQuizHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_objective_file', '/scratch/assignment/:assignmentId/quiz/file/:filename', ScratchObjectiveFileHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_materials', '/scratch/materials', ScratchMaterialsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_material', '/scratch/material/:materialId', ScratchMaterialHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_submission', '/scratch/submission/:submissionId', ScratchSubmissionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_editor', '/scratch/editor', ScratchEditorHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_thumbnail', '/scratch/work/:workId/thumbnail', ScratchThumbnailHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_community', '/scratch/community', ScratchCommunityHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_community_publish', '/scratch/work/:workId/community', ScratchCommunityPublishHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_community_work', '/scratch/community/:communityId', ScratchCommunityWorkHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_community_metrics', '/scratch/community/:communityId/metrics', ScratchCommunityMetricsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_community_state', '/scratch/community/:communityId/state', ScratchCommunityStateHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_community_analytics', '/scratch/community/:communityId/analytics', ScratchCommunityAnalyticsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_community_project', '/scratch/community/:communityId/project', ScratchCommunityProjectHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_community_thumbnail', '/scratch/community/:communityId/thumbnail', ScratchCommunityThumbnailHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_share_create', '/scratch/work/:workId/share', ScratchShareCreateHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('scratch_share', '/scratch/share/:token', ScratchShareHandler);
    ctx.Route('scratch_share_project', '/scratch/share/:token/project', ScratchShareProjectHandler);
    ctx.Route('scratch_file', '/scratch/file/:fileId', ScratchFileHandler, PRIV.PRIV_USER_PROFILE);
}
