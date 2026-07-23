import { escapeRegExp, pick } from 'lodash';
import { ObjectId } from 'mongodb';
import { sortFiles } from '@hydrooj/utils/lib/utils';
import {
    ContestNotFoundError, FileLimitExceededError, FileUploadError, HomeworkNotLiveError, NotAssignedError, ValidationError,
} from '../error';
import { Tdoc } from '../interface';
import { PERM, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import * as discussion from '../model/discussion';
import domain from '../model/domain';
import problem from '../model/problem';
import record from '../model/record';
import storage from '../model/storage';
import system from '../model/system';
import user from '../model/user';
import {
    Handler, param, post, Types,
} from '../service/server';
import { ContestCodeHandler, ContestFileDownloadHandler, ContestScoreboardHandler } from './contest';

const HOMEWORK_NO_DEADLINE = new Date('2099-12-31T23:59:59.999Z');
const UNCATEGORIZED_HOMEWORK = '__uncategorized__';
const ALL_HOMEWORK = '__all__';

function normalizeHomeworkCategory(category = '') {
    return category.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function homeworkCategoryQuery(category: string) {
    if (category === ALL_HOMEWORK) return {};
    if (category === UNCATEGORIZED_HOMEWORK) {
        return {
            $or: [
                { homeworkCategory: { $exists: false } },
                { homeworkCategory: '' },
                { homeworkCategory: null },
            ],
        };
    }
    return category ? { homeworkCategory: category } : {};
}

function combineHomeworkQueries(...queries: any[]) {
    const clauses = queries.filter((query) => Object.keys(query || {}).length);
    if (!clauses.length) return {};
    if (clauses.length === 1) return clauses[0];
    return { $and: clauses };
}

function getHomeworkProgress(tdoc: Tdoc, tsdoc: any) {
    const totalProblems = tdoc.pids.length;
    const acceptedProblems = tdoc.pids.filter((pid) => tsdoc?.detail?.[pid]?.status === STATUS.STATUS_ACCEPTED).length;
    const percent = totalProblems ? Math.round(100 * acceptedProblems / totalProblems) : 0;
    return {
        acceptedProblems,
        totalProblems,
        percent,
        done: totalProblems > 0 && acceptedProblems === totalProblems,
        started: !!tsdoc?.attend,
    };
}

async function resolveHomeworkRecipients(domainId: string, input: string | number[] = '') {
    const tokens = (Array.isArray(input) ? input.map(String) : input.split(/[，,;；\n]+/))
        .map((item) => item.trim())
        .filter(Boolean);
    if (!tokens.length) throw new ValidationError('assignedUsers');
    const recipients = await Promise.all(tokens.map(async (token) => {
        if (/^\d+$/.test(token)) return +token > 1 ? await user.getById(domainId, +token) : null;
        const byUname = await user.getByUname(domainId, token);
        if (byUname) return byUname;
        // Display names are convenient for teachers, but may not be unique.
        // Only accept an exact display-name match when it identifies one user.
        const matches = await domain.getMultiUserInDomain(domainId, {
            join: true,
            displayName: token,
        }).limit(2).project({ uid: 1 }).toArray();
        return matches.length === 1 ? await user.getById(domainId, matches[0].uid) : null;
    }));
    if (recipients.some((recipient) => !recipient)) throw new ValidationError('assignedUsers');
    return Array.from(new Set(recipients.map((recipient) => recipient!._id)));
}

async function getHomeworkStudentOptions(domainId: string) {
    const candidateRows = await domain.getMultiUserInDomain(domainId, { join: true })
        .sort({ uid: 1 }).limit(500).project({ uid: 1, displayName: 1 }).toArray();
    const candidateUids = candidateRows.map((row) => row.uid).filter((uid) => uid > 1);
    const candidateDict = await user.getListForRender(domainId, candidateUids, false);
    return candidateRows
        .filter((row) => candidateDict[row.uid])
        .map((row) => ({
            uid: row.uid,
            uname: candidateDict[row.uid].uname,
            displayName: row.displayName || candidateDict[row.uid].displayName || candidateDict[row.uid].uname,
        }));
}

function homeworkVisibilityQuery(uid: number) {
    return {
        $or: [
            // Teachers can still find work that they created or maintain even
            // when their role does not include the global view-all permission.
            { maintainer: uid },
            { owner: uid },
            // Learners must be an explicit recipient. Do not fall back to
            // legacy empty/group assignments here: a task intended for other
            // students must never appear in this student's homework list.
            { assignedUsers: uid },
        ],
    };
}

async function autoAttendAssignedUsers(domainId: string, tid: ObjectId, uids: number[]) {
    const recipients = Array.from(new Set(uids));
    if (!recipients.length) return;
    const existing = await contest.getMultiStatus(domainId, {
        docId: tid,
        uid: { $in: recipients },
    }).project({ uid: 1 }).toArray();
    const existingUids = new Set(existing.map((status) => status.uid));
    await Promise.all(recipients.filter((uid) => !existingUids.has(uid))
        .map((uid) => contest.attend(domainId, tid, uid)));
}

class HomeworkMainHandler extends Handler {
    async getStudentHomeworkProgress(domainId: string, query: any) {
        const tdocs = (await contest.getMulti(domainId, {
            rule: 'homework',
            ...query,
        }).sort({ beginAt: -1, _id: -1 }).toArray())
            .filter((tdoc) => (tdoc.assignedUsers || []).length);
        const tids = tdocs.map((tdoc) => tdoc.docId);
        const uids = Array.from(new Set(tdocs.flatMap((tdoc) => tdoc.assignedUsers || [])));
        const [statusDocs, udict] = await Promise.all([
            tids.length && uids.length
                ? contest.getMultiStatus(domainId, { docId: { $in: tids }, uid: { $in: uids } }).toArray()
                : [],
            uids.length
                ? user.getListForRender(domainId, uids, this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO))
                : {},
        ]);
        const statusByStudentAndHomework = new Map(statusDocs.map((status) => [
            `${status.uid}:${status.docId.toHexString()}`,
            status,
        ]));
        const students = uids.map((uid) => {
            const assignments = tdocs
                .filter((tdoc) => (tdoc.assignedUsers || []).includes(uid))
                .map((tdoc) => {
                    const status = statusByStudentAndHomework.get(`${uid}:${tdoc.docId.toHexString()}`);
                    const progress = getHomeworkProgress(
                        tdoc,
                        status,
                    );
                    return {
                        id: tdoc.docId,
                        title: tdoc.title,
                        category: normalizeHomeworkCategory(tdoc.homeworkCategory),
                        ...progress,
                    };
                });
            assignments.sort((a, b) => Number(a.done) - Number(b.done)
                || a.percent - b.percent
                || a.title.localeCompare(b.title));
            const totalProblems = assignments.reduce((sum, homework) => sum + homework.totalProblems, 0);
            const acceptedProblems = assignments.reduce((sum, homework) => sum + homework.acceptedProblems, 0);
            const incompleteAssignments = assignments.filter((homework) => !homework.done);
            const completedAssignments = assignments.filter((homework) => homework.done);
            const completedHomeworks = completedAssignments.length;
            return {
                uid,
                assignments,
                incompleteAssignments,
                completedAssignments,
                totalHomeworks: assignments.length,
                completedHomeworks,
                totalProblems,
                acceptedProblems,
                percent: totalProblems ? Math.round(100 * acceptedProblems / totalProblems) : 0,
                done: assignments.length > 0 && completedHomeworks === assignments.length,
            };
        }).filter((student) => udict[student.uid]);
        students.sort((a, b) => Number(a.done) - Number(b.done)
            || a.percent - b.percent
            || `${udict[a.uid].displayName || udict[a.uid].uname}`.localeCompare(`${udict[b.uid].displayName || udict[b.uid].uname}`));
        return {
            students,
            udict,
            totalHomeworks: tdocs.length,
        };
    }

    async getHomeworkAssignmentSummaries(domainId: string, tdocs: Tdoc[]) {
        const tids = tdocs.map((tdoc) => tdoc.docId);
        const uids = Array.from(new Set(tdocs.flatMap((tdoc) => tdoc.assignedUsers || [])));
        if (!tids.length || !uids.length) return {};
        const [statusDocs, udict] = await Promise.all([
            contest.getMultiStatus(domainId, { docId: { $in: tids }, uid: { $in: uids } }).toArray(),
            user.getListForRender(domainId, uids, this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO)),
        ]);
        const statusByStudentAndHomework = new Map(statusDocs.map((status) => [
            `${status.uid}:${status.docId.toHexString()}`,
            status,
        ]));
        return Object.fromEntries(tdocs.map((tdoc) => {
            const recipients = (tdoc.assignedUsers || []).filter((uid) => udict[uid]);
            const completedStudents = recipients.filter((uid) => getHomeworkProgress(
                tdoc,
                statusByStudentAndHomework.get(`${uid}:${tdoc.docId.toHexString()}`),
            ).done).map((uid) => ({
                uid,
                name: udict[uid].displayName || udict[uid].uname,
            }));
            const assignedStudents = recipients.map((uid) => ({
                uid,
                name: udict[uid].displayName || udict[uid].uname,
            }));
            return [tdoc.docId.toHexString(), {
                assignedCount: recipients.length,
                completedCount: completedStudents.length,
                assignedStudents,
                completedStudents,
            }];
        }));
    }

    @param('group', Types.Name, true)
    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    @param('view', Types.String, true)
    @param('category', Types.String, true)
    async get(domainId: string, group = '', page = 1, q = '', requestedView = '', requestedCategory = '') {
        const canViewAllHomework = this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_HOMEWORK);
        const canManageHomework = canViewAllHomework
            || this.user.hasPerm(PERM.PERM_CREATE_HOMEWORK)
            || this.user.hasPerm(PERM.PERM_EDIT_HOMEWORK);
        const canCreateHomework = this.user.hasPerm(PERM.PERM_CREATE_HOMEWORK);
        const view = canManageHomework && requestedView !== 'assignments' ? 'students' : 'assignments';
        const groups = canViewAllHomework
            ? (await user.listGroup(domainId)).map((i) => i.name)
            : [];
        if (group && !groups.includes(group)) throw new NotAssignedError(group);
        const visibilityQuery = canViewAllHomework ? {} : homeworkVisibilityQuery(this.user._id);
        const categoryDocs = canManageHomework
            ? await contest.getMulti(domainId, {
                rule: 'homework',
                ...visibilityQuery,
            }).project({ homeworkCategory: 1 }).toArray()
            : [];
        const homeworkCategories = Array.from(new Set(categoryDocs
            .map((tdoc) => normalizeHomeworkCategory(tdoc.homeworkCategory))
            .filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
        // Learners always see every homework assigned to them. Category
        // filtering is a teacher-only organisation tool.
        const category = canManageHomework ? (requestedCategory || UNCATEGORIZED_HOMEWORK) : '';

        if (view === 'students') {
            const homeworkStudentProgress = await this.getStudentHomeworkProgress(domainId, visibilityQuery);
            this.response.body = {
                tdocs: [],
                completedTdocs: [],
                studentView: false,
                canManageHomework,
                canCreateHomework,
                view,
                homeworkStudentProgress,
                tpcount: 0,
                page,
                qs: '',
                groups: [],
                group: '',
                q: '',
                category,
                homeworkCategories,
                homeworkAssignmentSummaries: {},
                homeworkStudentOptions: [],
            };
            this.response.template = 'homework_main.html';
            return;
        }

        const escaped = escapeRegExp(q.toLowerCase());
        const cursor = contest.getMulti(domainId, combineHomeworkQueries(
            { rule: 'homework' },
            visibilityQuery,
            canManageHomework ? homeworkCategoryQuery(category) : {},
            group ? { assign: { $in: [group] } } : {},
            q ? { title: { $regex: new RegExp(q.length >= 2 ? escaped : `\\A${escaped}`, 'gim') } } : {},
        )).sort({
            penaltySince: -1, endAt: -1, beginAt: -1, _id: -1,
        });
        const [tdocs, tpcount] = await this.paginate(cursor, page, 'contest');
        const tsdict = await contest.getListStatus(domainId, this.user._id, tdocs.map((tdoc) => tdoc.docId));
        const homeworkProgress = Object.fromEntries(tdocs.map((tdoc) => [
            tdoc.docId.toHexString(),
            getHomeworkProgress(tdoc, tsdict[tdoc.docId.toHexString()]),
        ]));
        // Learners should see the work they still need to do first. Keep the
        // completed work separate so the list stays focused even after a term
        // has accumulated many finished assignments.
        const studentView = !canManageHomework;
        const activeTdocs: Tdoc[] = [];
        const completedTdocs: Tdoc[] = [];
        for (const tdoc of tdocs) {
            (tdoc as any).homeworkProgress = homeworkProgress[tdoc.docId.toHexString()];
            if (studentView && (tdoc as any).homeworkProgress.done) completedTdocs.push(tdoc);
            else activeTdocs.push(tdoc);
        }
        const homeworkAssignmentSummaries = canManageHomework
            ? await this.getHomeworkAssignmentSummaries(domainId, tdocs)
            : {};
        const homeworkStudentOptions = canManageHomework ? await getHomeworkStudentOptions(domainId) : [];
        if (canManageHomework) {
            for (const tdoc of tdocs) {
                (tdoc as any).homeworkAssignmentSummary = homeworkAssignmentSummaries[tdoc.docId.toHexString()] || {
                    assignedCount: 0,
                    completedCount: 0,
                    assignedStudents: [],
                    completedStudents: [],
                };
            }
        }
        let qs = canManageHomework ? 'view=assignments' : '';
        if (canManageHomework && category !== UNCATEGORIZED_HOMEWORK) {
            qs += `${qs ? '&' : ''}category=${encodeURIComponent(category)}`;
        }
        if (group) qs += `${qs ? '&' : ''}group=${group}`;
        if (q) qs += `${qs ? '&' : ''}q=${encodeURIComponent(q)}`;
        const groupsFilter = groups.filter((i) => !Number.isSafeInteger(+i));
        this.response.body = {
            tdocs: activeTdocs,
            completedTdocs,
            studentView,
            canManageHomework,
            canCreateHomework,
            view,
            homeworkStudentProgress: { students: [], udict: {}, totalHomeworks: 0 },
            tsdict,
            homeworkProgress,
            tpcount,
            page,
            qs,
            groups: groupsFilter,
            group,
            q,
            category,
            homeworkCategories,
            homeworkAssignmentSummaries,
            homeworkStudentOptions,
        };
        this.response.template = 'homework_main.html';
    }
}

class HomeworkDetailHandler extends Handler {
    tdoc: Tdoc;

    @param('tid', Types.ObjectId)
    async prepare(domainId: string, tid: ObjectId) {
        this.tdoc = await contest.get(domainId, tid);
        if (this.tdoc.rule !== 'homework') throw new ContestNotFoundError(domainId, tid);
        if (!this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_HOMEWORK)) {
            const assignedUsers = this.tdoc.assignedUsers || [];
            const directAssigned = assignedUsers.includes(this.user._id);
            if (!directAssigned) {
                throw new NotAssignedError('homework', this.tdoc.docId);
            }
        }
    }

    @param('tid', Types.ObjectId)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, tid: ObjectId, page = 1) {
        if (this.tdoc.rule !== 'homework') throw new ContestNotFoundError(domainId, tid);
        const canViewAssignedProgress = this.user.own(this.tdoc)
            || this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_HOMEWORK);
        const homeworkDirectProblemLinks = this.user.own(this.tdoc)
            || this.user.hasPerm(PERM.PERM_EDIT_HOMEWORK)
            || this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_HOMEWORK);
        const requestedUid = Number(this.request.query.uid);
        const targetUid = Number.isSafeInteger(requestedUid) && requestedUid > 1 && requestedUid !== this.user._id
            ? requestedUid
            : this.user._id;
        if (targetUid !== this.user._id
            && (!canViewAssignedProgress || !(this.tdoc.assignedUsers || []).includes(targetUid))) {
            throw new NotAssignedError('homework', this.tdoc.docId);
        }
        const [tsdoc, progressUser] = await Promise.all([
            contest.getStatus(domainId, tid, targetUid),
            targetUid === this.user._id ? null : user.getById(domainId, targetUid),
        ]);
        // discussion
        const [ddocs, dpcount, dcount] = await this.paginate(
            discussion.getMulti(domainId, { parentType: this.tdoc.docType, parentId: this.tdoc.docId }),
            page,
            'discussion',
        );
        const uids = ddocs.map((ddoc) => ddoc.owner);
        uids.push(this.tdoc.owner);
        const udict = await user.getList(domainId, uids);
        this.response.template = 'homework_detail.html';
        this.response.body = {
            tdoc: this.tdoc,
            tsdoc,
            homeworkProgress: getHomeworkProgress(this.tdoc, tsdoc),
            homeworkProgressUserName: progressUser?.displayName || progressUser?.uname || '',
            homeworkDirectProblemLinks,
            udict,
            ddocs,
            page,
            dpcount,
            dcount,
        };
        this.response.body.tdoc.content = this.response.body.tdoc.content
            .replace(/\(file:\/\//g, `(./${this.tdoc.docId}/file/public/`)
            .replace(/="file:\/\//g, `="./${this.tdoc.docId}/file/public/`);
        if (
            (contest.isNotStarted(this.tdoc) || (!tsdoc?.attend && !contest.isDone(this.tdoc)))
            && !this.user.own(this.tdoc)
            && !this.user.hasPerm(PERM.PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD)
        ) return;
        const pdict = await problem.getList(domainId, this.tdoc.pids, true, true, problem.PROJECTION_CONTEST_LIST);
        // `detail` stores each problem's current best result. The journal is
        // only the submission history, so using it here could show an older,
        // lower score after a student improves their solution.
        const psdict = { ...(tsdoc?.detail || {}) };
        let rdict = {};
        if (tsdoc) {
            if (targetUid === this.user._id && tsdoc.attend && !tsdoc.startAt && contest.isOngoing(this.tdoc)) {
                await contest.setStatus(domainId, tid, targetUid, { startAt: new Date() });
                tsdoc.startAt = new Date();
            }
            const valid = (tsdoc.journal || []).filter((p) => this.tdoc.pids.includes(p.pid));
            for (const pdetail of valid) {
                rdict[pdetail.rid] = { _id: pdetail.rid };
            }
            if (contest.canShowSelfRecord.call(this, this.tdoc) && valid.length) {
                rdict = await record.getList(domainId, valid.map((pdetail) => pdetail.rid));
            }
        }
        Object.assign(this.response.body, { pdict, psdict, rdict });
    }

    async postAttend({ domainId }) {
        this.checkPerm(PERM.PERM_ATTEND_HOMEWORK);
        if (contest.isDone(this.tdoc)) throw new HomeworkNotLiveError(this.tdoc.docId);
        await contest.attend(domainId, this.tdoc.docId, this.user._id);
        this.back();
    }
}

class HomeworkEditHandler extends Handler {
    @param('tid', Types.ObjectId, true)
    async get(domainId: string, tid: ObjectId) {
        const tdoc = tid ? await contest.get(domainId, tid) : null;
        if (!tid) this.checkPerm(PERM.PERM_CREATE_HOMEWORK);
        else if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        else this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
        this.response.template = 'homework_edit.html';
        this.response.body = {
            tdoc,
            pids: tid ? tdoc.pids.join(',') : '',
            assignedUsers: tid ? (tdoc.assignedUsers || []).join(',') : '',
            homeworkCategory: tid ? normalizeHomeworkCategory(tdoc.homeworkCategory) : '',
            homeworkStudentOptions: await getHomeworkStudentOptions(domainId),
            page_name: tid ? 'homework_edit' : 'homework_create',
        };
    }

    @param('tid', Types.ObjectId, true)
    @param('title', Types.Title)
    @param('content', Types.Content, true)
    @param('pids', Types.Content)
    @param('maintainer', Types.NumericArray, true)
    @param('assignedUsers', Types.String, true)
    @param('langs', Types.CommaSeperatedArray, true)
    @param('homeworkCategory', Types.String, true)
    async postUpdate(
        domainId: string, tid: ObjectId, title: string, content = '', _pids = '',
        maintainer: number[] = [], assignedUsers = '', langs: string[] = [], homeworkCategory = '',
    ) {
        const pids = Array.from(new Set(_pids.replace(/，/g, ',').split(',').map((i) => +i).filter((i) => i)));
        const recipients = await resolveHomeworkRecipients(domainId, assignedUsers);
        const category = normalizeHomeworkCategory(homeworkCategory);
        const tdoc = tid ? await contest.get(domainId, tid) : null;
        if (!tid) this.checkPerm(PERM.PERM_CREATE_HOMEWORK);
        else if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        else this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
        await problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id, true);
        if (!tid) {
            tid = await contest.add(domainId, title, content, this.user._id, 'homework', new Date(), new Date(HOMEWORK_NO_DEADLINE), pids, false, {
                penaltySince: new Date(HOMEWORK_NO_DEADLINE),
                penaltyRules: {},
                assignedUsers: recipients,
                homeworkNoDeadline: true,
                homeworkCategory: category,
                maintainer,
                langs,
            });
        } else {
            await contest.edit(domainId, tid, {
                title,
                content,
                beginAt: tdoc.beginAt,
                endAt: new Date(HOMEWORK_NO_DEADLINE),
                pids,
                penaltySince: new Date(HOMEWORK_NO_DEADLINE),
                penaltyRules: {},
                rated: false,
                maintainer,
                assignedUsers: recipients,
                homeworkNoDeadline: true,
                homeworkCategory: category,
                langs,
            });
            if (tdoc.pids.sort().join(' ') !== pids.sort().join(' ')) {
                await contest.recalcStatus(domainId, tdoc.docId);
            }
        }
        await autoAttendAssignedUsers(domainId, tid, recipients);
        this.response.body = { tid };
        this.response.redirect = this.url('homework_detail', { tid });
    }

    @param('tid', Types.ObjectId)
    @param('assignedUsers', Types.String, true)
    async postAddStudents(domainId: string, tid: ObjectId, assignedUsers = '') {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        else this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
        const resolvedUsers = await resolveHomeworkRecipients(domainId, assignedUsers);
        const addedUsers = resolvedUsers.filter((uid) => !(tdoc.assignedUsers || []).includes(uid));
        if (!addedUsers.length) throw new ValidationError('assignedUsers');
        await contest.edit(domainId, tid, {
            assignedUsers: [...(tdoc.assignedUsers || []), ...addedUsers],
        });
        await autoAttendAssignedUsers(domainId, tid, addedUsers);
        const category = normalizeHomeworkCategory(tdoc.homeworkCategory);
        this.response.redirect = this.url('homework_main', {
            query: { view: 'assignments', ...(category ? { category } : {}) },
        });
    }

    @param('tid', Types.ObjectId)
    async postDelete(domainId: string, tid: ObjectId) {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        await Promise.all([
            record.updateMulti(domainId, { domainId, contest: tid }, undefined, undefined, { contest: '' }),
            contest.del(domainId, tid),
            storage.del(tdoc.files?.map((i) => `contest/${domainId}/${tid}/public/${i.name}`) || [], this.user._id),
        ]);
        this.response.redirect = this.url('homework_main');
    }
}

export class HomeworkFilesHandler extends Handler {
    tdoc: Tdoc;

    @param('tid', Types.ObjectId)
    async prepare(domainId: string, tid: ObjectId) {
        this.tdoc = await contest.get(domainId, tid);
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        else this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
    }

    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        this.response.body = {
            tdoc: this.tdoc,
            tsdoc: await contest.getStatus(domainId, this.tdoc.docId, this.user._id),
            udoc: await user.getById(domainId, this.tdoc.owner),
            files: sortFiles(this.tdoc.files || []),
            urlForFile: (filename: string) => this.url('homework_file_download', { tid, filename, type: 'public' }),
        };
        this.response.pjax = 'partials/files.html';
        this.response.template = 'homework_files.html';
    }

    @param('tid', Types.ObjectId)
    @post('filename', Types.Filename, true)
    async postUploadFile(domainId: string, tid: ObjectId, filename: string) {
        if ((this.tdoc.files?.length || 0) >= system.get('limit.contest_files')) {
            throw new FileLimitExceededError('count');
        }
        const file = this.request.files?.file;
        if (!file) throw new ValidationError('file');
        const size = Math.sum((this.tdoc.files || []).map((i) => i.size)) + file.size;
        if (size >= system.get('limit.contest_files_size')) {
            throw new FileLimitExceededError('size');
        }
        await storage.put(`contest/${domainId}/${tid}/public/${filename}`, file.filepath, this.user._id);
        const meta = await storage.getMeta(`contest/${domainId}/${tid}/public/${filename}`);
        const payload = { _id: filename, name: filename, ...pick(meta, ['size', 'lastModified', 'etag']) };
        if (!meta) throw new FileUploadError();
        await contest.edit(domainId, tid, { files: [...(this.tdoc.files || []), payload] });
        this.back();
    }

    @param('tid', Types.ObjectId)
    @post('files', Types.ArrayOf(Types.Filename))
    async postDeleteFiles(domainId: string, tid: ObjectId, files: string[]) {
        await Promise.all([
            storage.del(files.map((t) => `contest/${domainId}/${tid}/public/${t}`), this.user._id),
            contest.edit(domainId, tid, { files: this.tdoc.files.filter((i) => !files.includes(i.name)) }),
        ]);
        this.back();
    }
}

export async function apply(ctx) {
    ctx.Route('homework_main', '/homework', HomeworkMainHandler, PERM.PERM_VIEW_HOMEWORK);
    ctx.Route('homework_create', '/homework/create', HomeworkEditHandler);
    ctx.Route('homework_detail', '/homework/:tid', HomeworkDetailHandler, PERM.PERM_VIEW_HOMEWORK);
    ctx.Route('homework_code', '/homework/:tid/code', ContestCodeHandler, PERM.PERM_VIEW_HOMEWORK);
    ctx.Route('homework_edit', '/homework/:tid/edit', HomeworkEditHandler);
    ctx.Route('homework_files', '/homework/:tid/file', HomeworkFilesHandler, PERM.PERM_VIEW_HOMEWORK);
    ctx.Route('homework_file_download', '/homework/:tid/file/:type/:filename', ContestFileDownloadHandler, PERM.PERM_VIEW_HOMEWORK);
    await ctx.inject(['scoreboard'], ({ Route }) => {
        Route('homework_scoreboard', '/homework/:tid/scoreboard', ContestScoreboardHandler, PERM.PERM_VIEW_HOMEWORK_SCOREBOARD);
        Route('homework_scoreboard_view', '/homework/:tid/scoreboard/:view', ContestScoreboardHandler, PERM.PERM_VIEW_HOMEWORK_SCOREBOARD);
    });
}
