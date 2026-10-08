import { createReadStream } from 'fs';
import { PassThrough, Readable, Writable } from 'stream';
import { Entry, ZipReader } from '@zip.js/zip.js';
import { readFile } from 'fs-extra';
import {
    escapeRegExp, flattenDeep, intersection, pick,
} from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';
import sanitize from 'sanitize-filename';
import Schema from 'schemastery';
import parser from '@hydrooj/utils/lib/search';
import {
    randomstring, sortFiles, streamToBuffer, Time,
} from '@hydrooj/utils/lib/utils';
import type { Context } from '../context';
import {
    BadRequestError, ContestNotAttendedError, ContestNotEndedError, ContestNotFoundError, ContestNotLiveError,
    FileLimitExceededError, FileTooLargeError, HackFailedError, NoProblemError, NotFoundError,
    PermissionError, ProblemAlreadyExistError, ProblemAlreadyUsedByContestError, ProblemConfigError,
    ProblemIsReferencedError, ProblemNotAllowCopyError, ProblemNotAllowLanguageError, ProblemNotAllowPretestError,
    ProblemNotFoundError, RecordNotFoundError, SolutionNotFoundError, UserNotFoundError, ValidationError,
} from '../error';
import {
    DomainDoc, ProblemDoc, ProblemSearchOptions, ProblemStatusDoc, RecordDoc, User,
} from '../interface';
import { tryRedirectAsset } from '../lib/asset_delivery';
import avatar from '../lib/avatar';
import { getActiveBadgeAcTheme } from '../lib/badge_ac_theme';
import { canViewContestLevel } from '../lib/contest_access';
import { isScratchDomain } from '../lib/domain_type';
import {
    authorizeHomeworkReview, loadHomeworkReviewRecord, loadHomeworkReviewRecords, publicHomeworkReviewRecord, rejectHomeworkReviewMutation,
} from '../lib/homework_review';
import { isInlineRasterImage } from '../lib/inline_image';
import { canAccessHomeworkProblem, loadMistakeHomework } from '../lib/mistake_access';
import { getMistakePromptState } from '../lib/mistake_prompt';
import {
    buildObjectivePaper, objectiveConfig, objectiveContent, ObjectivePaper, parseObjective, parseObjectivePaper, parseObjectiveTags,
    rewriteObjectiveFiles,
} from '../lib/objective';
import { loadObjectiveCorrectAnswers } from '../lib/objective_correct_answers';
import { buildObjectiveMergedReview } from '../lib/objective_merged_review';
import { loadObjectiveSubmissionConfig, loadOwnObjectiveSubmission } from '../lib/objective_submission';
import { getLatestVisiblePinnedContest } from '../lib/pinned_contest';
import {
    assertRecordReplayRequest, canUseProblemRecordPicker, loadProblemMergedReview, loadProblemRecordReplay,
} from '../lib/problem_record_replay';
import { canManageRecordList } from '../lib/record_list_scope';
import {
    appendHiddenSuperAdminFilter, canViewRecordOwner, getHiddenSuperAdminUids,
} from '../lib/record_visibility';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import * as discussion from '../model/discussion';
import * as document from '../model/document';
import domain from '../model/domain';
import * as mistake from '../model/mistake';
import * as oplog from '../model/oplog';
import problem from '../model/problem';
import record from '../model/record';
import * as setting from '../model/setting';
import solution from '../model/solution';
import storage from '../model/storage';
import system from '../model/system';
import user from '../model/user';
import workspace from '../model/workspace';
import {
    Handler, param, post, Query, query, route, Types,
} from '../service/server';
import { ContestDetailBaseHandler } from './contest';

const CPP_STARTER_TEMPLATE = `#include<bits/stdc++.h>
using namespace std;
int main(){

    return 0;
}
`;

const CPP_BEGINNER_TEMPLATE_PREFIX = `#include<bits/stdc++.h>
using namespace std;
int main(){
`;

const CPP_BEGINNER_TEMPLATE_SUFFIX = `
    return 0;
}
`;

type CppEditorMode = 'beginner' | 'preset' | 'proficient';

function getCppEditorMode(udoc: User): CppEditorMode {
    const globalSettings = udoc as unknown as { cppEditorMode?: unknown };
    if (globalSettings.cppEditorMode === 'beginner'
        || globalSettings.cppEditorMode === 'preset'
        || globalSettings.cppEditorMode === 'proficient') {
        return globalSettings.cppEditorMode;
    }
    // A previous release stored this on each membership. Continue honoring a
    // legacy value in the current domain until an administrator saves the new
    // account-wide preference.
    const legacySettings = udoc._dudoc as { cppEditorMode?: unknown, cppStarterTemplate?: unknown };
    if (legacySettings.cppEditorMode === 'beginner'
        || legacySettings.cppEditorMode === 'preset'
        || legacySettings.cppEditorMode === 'proficient') {
        return legacySettings.cppEditorMode;
    }
    return legacySettings.cppStarterTemplate === true ? 'preset' : 'proficient';
}

function isCppLanguage(lang: string) {
    const language = setting.langs[lang];
    return language?.monaco === 'cpp'
        || language?.highlight?.split(/\s+/).includes('cpp')
        || lang === 'cc'
        || lang.startsWith('cc.');
}

function isCompleteCppTranslationUnit(code: string) {
    return /\b(?:int|signed|auto)\s+main\s*\(/.test(code);
}

function wrapBeginnerCppCode(code: string) {
    const body = code ? (code.endsWith('\n') ? code : `${code}\n`) : '';
    return `${CPP_BEGINNER_TEMPLATE_PREFIX}${body}${CPP_BEGINNER_TEMPLATE_SUFFIX}`;
}

export const parseCategory = (value: string) => value.replace(/，/g, ',').split(',').map((e) => e.trim());

async function copyObjectiveFiles(domainId: string, docId: number, content: string, udoc: User) {
    const files = new Set(Array.from(content.matchAll(/file:\/\/([\w-]+\.[a-zA-Z0-9]+)/g)).map((i) => i[1]));
    const results = await Promise.allSettled([...files].filter((file) => udoc._files?.some((i) => i.name === file)).map(async (file) => {
        // Keep the uploaded draft intact if saving the question fails.
        await storage.copy(`user/${udoc._id}/${file}`, `problem/${domainId}/${docId}/additional_file/${file}`);
        await problem.addAdditionalFile(domainId, docId, file, '', udoc._id, true);
    }));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
}

function buildQuery(udoc: User) {
    const q: Filter<ProblemDoc> = {};
    if (!udoc.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) {
        q.$or = [
            { hidden: false },
            { owner: udoc._id },
            { maintainer: udoc._id },
        ];
    }
    return q;
}

function getDomainDefaultCodeLang(ddoc?: DomainDoc | null) {
    const lang = String(ddoc?.defaultCodeLang || '').trim();
    return lang && setting.langs[lang] && !setting.langs[lang].disabled ? lang : '';
}

function pickPreferredCodeLang(langs: string[], udoc: User, ddoc?: DomainDoc | null) {
    const domainCodeLang = getDomainDefaultCodeLang(ddoc);
    const preferred = [domainCodeLang, udoc.codeLang, 'py.py3', 'cc.cc14', 'cc.cc17', 'cc.cc20', 'cc.cc11', 'cc'];
    return preferred.find((lang) => lang && langs.includes(lang)) || langs[0] || domainCodeLang || udoc.codeLang || 'py.py3';
}

type ProblemCategoryEntry = [string, string[]];

const AUTO_CATEGORY_GROUPS = [
    { name: '语言', keywords: ['python', 'c++', 'cpp', 'c语言', 'java', 'javascript', 'js', 'go', 'rust', 'php'] },
    { name: '入门基础', keywords: ['入门', '基础', '输出', '输入', '变量', '顺序', '模拟'] },
    { name: '语法结构', keywords: ['选择', '判断', '分支', '循环', '数组', '字符串', '函数'] },
    {
        name: '算法与数据结构',
        keywords: [
            '排序', '查找', '搜索', '递归', '回溯', '贪心', '动态规划', 'dp', 'bfs', 'dfs',
            '图论', '最短路', '树', '并查集', '二分', '前缀和', '差分', '栈', '队列', '双指针',
        ],
    },
    { name: '数学逻辑', keywords: ['数学', '数论', '组合', '概率', '高精度', '枚举', '取余', '取整', '日期'] },
    { name: '竞赛考级', keywords: ['gesp', 'csp', 'noip', '蓝桥', '真题', '模拟赛', '信息素养', '竞赛'] },
];

function normalizeProblemTag(tag: unknown) {
    return String(tag || '').trim();
}

function inferProblemTagGroup(tag: string) {
    const structured = tag.split(/[/>＞:：|]/).map((i) => i.trim()).filter((i) => i);
    if (structured.length > 1 && structured[0].length <= 12) return structured[0];
    const lowered = tag.toLowerCase();
    for (const group of AUTO_CATEGORY_GROUPS) {
        if (group.keywords.some((keyword) => lowered.includes(keyword.toLowerCase()) || tag.includes(keyword))) return group.name;
    }
    return '其他标签';
}

async function buildAutoProblemCategories(domainId: string, udoc: User): Promise<ProblemCategoryEntry[]> {
    const tagCounts = new Map<string, number>();
    for await (const pdoc of problem.getMulti(domainId, buildQuery(udoc), ['tag'])) {
        for (const rawTag of pdoc.tag || []) {
            const tag = normalizeProblemTag(rawTag);
            if (!tag) continue;
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
    }
    const grouped = new Map<string, [string, number][]>();
    for (const entry of tagCounts.entries()) {
        const group = inferProblemTagGroup(entry[0]);
        grouped.set(group, [...(grouped.get(group) || []), entry]);
    }
    const groupOrder = new Map(AUTO_CATEGORY_GROUPS.map((group, index) => [group.name, index]));
    groupOrder.set('其他标签', AUTO_CATEGORY_GROUPS.length);
    return [...grouped.entries()]
        .sort(([a], [b]) => (groupOrder.get(a) ?? 999) - (groupOrder.get(b) ?? 999) || a.localeCompare(b))
        .map(([group, tags]) => [
            group,
            tags.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24).map(([tag]) => tag),
        ] as ProblemCategoryEntry)
        .filter(([, tags]) => tags.length);
}

const defaultSearch = async (domainId: string, q: string, options?: ProblemSearchOptions) => {
    const escaped = escapeRegExp(q.toLowerCase());
    const projection: (keyof ProblemDoc)[] = ['domainId', 'docId', 'pid', 'objectiveKind'];
    const $regex = new RegExp(q.length >= 2 ? escaped : `^${escaped}`, 'gim');
    const textFilter: Filter<ProblemDoc> = { $or: [{ pid: { $regex } }, { title: { $regex } }, { tag: q }] };
    const excludedDocIds = new Set(options?.excludeDocIds || []);
    const filter: Filter<ProblemDoc> = excludedDocIds.size
        ? { $and: [textFilter, { docId: { $nin: [...excludedDocIds] } }] }
        : textFilter;
    let exactPdoc = await problem.get(domainId, Number.isSafeInteger(+q) ? +q : q, projection);
    if (!exactPdoc && /^P\d+$/.test(q)) {
        exactPdoc = await problem.get(domainId, +q.substring(1), projection);
    }
    // Exact-ID lookup must use the same source exclusion as the paginated catalog.
    if (problem.isObjectiveSource(exactPdoc)) exactPdoc = null;
    if (exactPdoc && excludedDocIds.has(exactPdoc.docId)) exactPdoc = null;
    const normalFilter: Filter<ProblemDoc> = exactPdoc
        ? { $and: [filter, { docId: { $ne: exactPdoc.docId } }] }
        : filter;
    const skip = options?.skip || 0;
    const limit = options?.limit || system.get('pagination.problem');
    const normalSkip = exactPdoc ? Math.max(0, skip - 1) : skip;
    const normalLimit = exactPdoc && !skip ? Math.max(0, limit - 1) : limit;
    const pdocs = normalLimit
        ? await problem.getMulti(domainId, normalFilter, projection).skip(normalSkip).limit(normalLimit).toArray()
        : [];
    const hits = [
        ...exactPdoc && !skip ? [`${exactPdoc.domainId}/${exactPdoc.docId}`] : [],
        ...pdocs.map((i) => `${i.domainId}/${i.docId}`),
    ];
    return {
        hits,
        total: (exactPdoc ? 1 : 0) + await problem.count(domainId, normalFilter),
        countRelation: 'eq',
    };
};

interface ProblemFilterScope {
    ddoc: DomainDoc;
    actorUid: number;
    workspaceId: string;
    scopeDomainIds: string[];
    memberUids: Set<number>;
    excludedLegacyUids: Set<number>;
}

async function prepareProblemFilterScope(ddoc: DomainDoc, actorUid: number): Promise<ProblemFilterScope> {
    const workspaceId = workspace.resolveDomainWorkspaceId(ddoc);
    const legacyWorkspace = workspaceId === workspace.LEGACY_WORKSPACE_ID
        ? await workspace.getLegacyWorkspace()
        : null;
    const hasLegacyGlobalScope = legacyWorkspace?.ownerUid === actorUid;
    const scopeDomains = hasLegacyGlobalScope
        ? await workspace.getDomains(workspace.LEGACY_WORKSPACE_ID)
        : [ddoc];
    const [members, excludedLegacyUids] = await Promise.all([
        workspace.getMembers(workspaceId),
        workspaceId === workspace.LEGACY_WORKSPACE_ID
            ? workspace.getExcludedLegacyUids()
            : Promise.resolve(new Set<number>()),
    ]);
    return {
        ddoc,
        actorUid,
        workspaceId,
        scopeDomainIds: scopeDomains.map((item) => item._id),
        memberUids: new Set(members.map((item) => item.uid)),
        excludedLegacyUids,
    };
}

async function resolveProblemFilterStudent(
    ddoc: DomainDoc, actorUid: number, targetUid: number, preparedScope?: ProblemFilterScope,
) {
    const invalidTarget = () => new UserNotFoundError(targetUid.toString());
    const account = await user.coll.findOne({ _id: targetUid });
    if (!account
        || targetUid <= 1
        || targetUid === actorUid
        || !(account.priv & PRIV.PRIV_USER_PROFILE)
        || (account.priv & (PRIV.PRIV_EDIT_SYSTEM | PRIV.PRIV_MANAGE_ALL_DOMAIN | PRIV.PRIV_JUDGE))
        || workspace.isPlatformAdmin(targetUid)) throw invalidTarget();

    const scope = preparedScope || await prepareProblemFilterScope(ddoc, actorUid);
    const memberships = await domain.collUser.find({
        domainId: { $in: scope.scopeDomainIds },
        uid: targetUid,
        join: true,
    }).project<{ domainId: string }>({ domainId: 1 }).toArray();
    if (!memberships.length) throw invalidTarget();

    const assignedToOtherWorkspace = scope.workspaceId !== workspace.LEGACY_WORKSPACE_ID
        && await workspace.isAssignedToOtherWorkspace(targetUid, scope.workspaceId);
    if (scope.memberUids.has(targetUid)
        || scope.excludedLegacyUids.has(targetUid)
        || assignedToOtherWorkspace) throw invalidTarget();

    const scopedUsers = await Promise.all(memberships.map((item) => user.getById(item.domainId, targetUid)));
    if (scopedUsers.some((item) => item?.hasPerm(PERM.PERM_EDIT_DOMAIN))) throw invalidTarget();

    const target = await user.getById(ddoc._id, targetUid);
    if (!target) throw invalidTarget();
    return target;
}

export interface QueryContext {
    query: Filter<ProblemDoc>;
    sort: string[];
    pcountRelation: string;
    parsed: ReturnType<typeof parser.parse>;
    category: string[];
    text: string;
    total: number;
    fail: boolean;
    hint: string;
}

export class ProblemMainHandler extends Handler {
    queryContext: QueryContext = {
        query: {},
        sort: [],
        pcountRelation: 'eq',
        parsed: null,
        category: [],
        text: '',
        total: 0,
        fail: false,
        hint: 'sort',
    };

    @param('page', Types.PositiveInt, true)
    @param('q', Types.Content, true)
    @param('limit', Types.PositiveInt, true)
    @param('pjax', Types.Boolean)
    @param('quick', Types.Boolean)
    @param('sort', Types.Range(['default', 'recent']), true)
    @param('unacUid', Types.PositiveInt, true)
    async get(
        domainId: string, page = 1, q = '', limit: number, pjax = false, quick = false,
        sortStrategy = 'default', unacUid?: number,
    ) {
        domainId = this.domain._id;
        this.response.template = 'problem_main.html';
        if (!limit || limit > this.ctx.setting.get('pagination.problem') || page > 1) limit = this.ctx.setting.get('pagination.problem');
        this.queryContext.query = buildQuery(this.user);
        if (sortStrategy === 'recent') this.queryContext.hint = 'basic';
        // eslint-disable-next-line ts/no-shadow
        const query = this.queryContext.query;
        const psdict = {};
        const canFilterStudentUnaccepted = this.user.hasPerm(PERM.PERM_EDIT_DOMAIN);
        if (unacUid && !canFilterStudentUnaccepted) throw new PermissionError(PERM.PERM_EDIT_DOMAIN);
        const filterStudent = unacUid
            ? await resolveProblemFilterStudent(this.domain, this.user._id, unacUid)
            : null;
        const acceptedDocIds = filterStudent
            ? (await problem.getMultiStatus(domainId, {
                uid: filterStudent._id,
                status: STATUS.STATUS_ACCEPTED,
            }).project<Pick<ProblemStatusDoc, 'docId'>>({ _id: 0, docId: 1 }).toArray()).map((item) => item.docId)
            : [];
        const search = Object.values(global.Hydro.module.problemSearch)[0] || defaultSearch;
        const parsed = parser.parse(q, {
            keywords: ['category', 'difficulty', 'namespace'],
            offsets: false,
            alwaysArray: true,
            tokenize: true,
        });
        const category = parsed.category || [];
        const text = (parsed.text || []).join(' ');
        if (parsed.difficulty?.every((i) => Number.isSafeInteger(+i))) {
            query.difficulty = { $in: parsed.difficulty.flatMap((i) => +i === 0 ? [0, undefined] : [+i]) };
        }
        if (category.length) query.$and = category.map((tag) => ({ tag }));
        if (parsed.namespace?.length) {
            const mappedPrefix = this.domain.namespaces?.[parsed.namespace[0]];
            query.$and ||= [];
            if (mappedPrefix) query.$and.push({ sort: new RegExp(`^${mappedPrefix}-`) });
            else query.$and.push({ tag: parsed.namespace[0] });
        }
        if (text) category.push(text);
        if (category.length) this.UiContext.extraTitleContent = category.join(',');
        let total = 0;
        if (text) {
            const result = await search(domainId, q, {
                skip: (page - 1) * limit,
                limit,
                excludeDocIds: acceptedDocIds,
            });
            total = result.total;
            this.queryContext.pcountRelation = result.countRelation;
            if (!result.hits.length) this.queryContext.fail = true;
            query.docId = { $in: result.hits.map((t) => +t.split('/')[1]) };
            this.queryContext.hint = 'basic';
            this.queryContext.sort = result.hits;
        }
        if (acceptedDocIds.length) {
            query.$and ||= [];
            query.$and.push({ docId: { $nin: acceptedDocIds } });
        }
        const sort = this.queryContext.sort;
        await this.ctx.parallel('problem/list', query, this, sort);
        const sortKey = ({
            default: { sort: 1, docId: 1 },
            recent: { docId: -1 },
        } as const)[sortStrategy];
        let [pdocs, ppcount, pcount] = this.queryContext.fail
            ? [[], 0, 0]
            : await this.paginate(
                problem.getMulti(domainId, query, quick ? ['title', 'pid', 'domainId', 'docId'] : undefined)
                    .sort(sortKey).hint(this.queryContext.hint),
                sort.length ? 1 : page, limit,
            );
        if (total) {
            pcount = total;
            ppcount = Math.ceil(total / limit);
        }
        if (sort.length) pdocs = pdocs.sort((a, b) => sort.indexOf(`${a.domainId}/${a.docId}`) - sort.indexOf(`${b.domainId}/${b.docId}`));
        if (text && pcount > pdocs.length) pcount = pdocs.length;
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            Object.assign(psdict, await problem.getListStatus(
                domainId, filterStudent?._id || this.user._id,
                pdocs.map((i) => i.docId),
            ));
        }
        let problemCategories: ProblemCategoryEntry[] = [];
        let pinnedContest: Awaited<ReturnType<typeof getLatestVisiblePinnedContest>> = null;
        if (!pjax) {
            [problemCategories, pinnedContest] = await Promise.all([
                buildAutoProblemCategories(domainId, this.user),
                getLatestVisiblePinnedContest(domainId, this.user),
            ]);
        }
        if (pjax) {
            this.response.body = {
                title: this.renderTitle(this.translate('problem_main')),
                fragments: (await Promise.all([
                    this.renderHTML('partials/problem_list.html', {
                        page,
                        ppcount,
                        pcount,
                        pdocs,
                        psdict,
                        qs: q,
                        sort: sortStrategy,
                        canFilterStudentUnaccepted,
                        filterStudent,
                        filterStudentUid: filterStudent?._id,
                    }),
                    this.renderHTML('partials/problem_lucky.html', { qs: q }),
                ])).map((i) => ({ html: i })),
            };
        } else {
            this.response.body = {
                page,
                pcount,
                ppcount,
                pcountRelation: this.queryContext.pcountRelation,
                pdocs,
                psdict,
                qs: q,
                sort: sortStrategy,
                canFilterStudentUnaccepted,
                filterStudent,
                filterStudentUid: filterStudent?._id,
                problemCategories,
                problemCategoriesAuto: true,
                pinnedContest,
            };
        }
    }

    @param('pids', Types.NumericArray)
    @param('target', Types.String)
    @param('hidden', Types.Boolean)
    @param('redirect', Types.Boolean)
    async postCopy(domainId: string, pids: number[], target: string, hidden?: boolean, redirect = false) {
        let t = `,${this.domain.share || ''},`;
        if (t !== ',*,' && !t.includes(`,${target},`)) throw new ProblemNotAllowCopyError(this.domain._id, target);
        const ddoc = await domain.get(target);
        if (!ddoc) throw new NotFoundError(target);
        const dudoc = await user.getById(target, this.user._id);
        if (!dudoc.hasPerm(PERM.PERM_CREATE_PROBLEM)) throw new PermissionError(PERM.PERM_CREATE_PROBLEM);
        if (!pids.length) throw new ValidationError('pids');
        // Check if user can access all those problems
        const pdict = await problem.getList(
            domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id,
            true, ['domainId', 'docId', 'reference'], true,
        );
        const ids = [];
        for (const pid of pids) {
            let pdoc = pdict[pid];
            if (pdoc.reference) {
                // eslint-disable-next-line no-await-in-loop
                const [sourcePdoc, sourceDdoc] = await Promise.all([
                    problem.get(pdoc.reference.domainId, pdoc.reference.pid),
                    domain.get(pdoc.reference.domainId),
                ]);
                if (!sourcePdoc) throw new ProblemNotFoundError(pdoc.reference.domainId, pdoc.reference.pid);
                else pdoc = sourcePdoc;
                t = `,${sourceDdoc.share || ''},`;
                if (t !== ',*,' && !t.includes(`,${target},`)) throw new ProblemNotAllowCopyError(sourceDdoc._id, target);
            }
            // eslint-disable-next-line no-await-in-loop
            ids.push(await problem.copy(pdoc.domainId, pdoc.docId, target, undefined, hidden));
        }
        if (redirect) this.response.redirect = this.url('problem_detail', { domainId: target, pid: ids[0] });
        else this.response.body = ids;
    }

    @param('pids', Types.NumericArray)
    async postDelete(domainId: string, pids: number[]) {
        let i = 0;
        for (const pid of pids) {
            // eslint-disable-next-line no-await-in-loop
            const pdoc = await problem.get(domainId, pid);
            if (!pdoc) continue;
            if (!this.user.own(pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
            // eslint-disable-next-line no-await-in-loop
            await problem.del(domainId, pid);
            i++;
            this.progress('Deleting: ({0}/{1})', [i, pids.length]);
        }
        this.back();
    }

    @param('pids', Types.NumericArray)
    async postHide(domainId: string, pids: number[]) {
        for (const pid of pids) {
            // eslint-disable-next-line no-await-in-loop
            const pdoc = await problem.get(domainId, pid);
            if (!pdoc) throw new ProblemNotFoundError(domainId, pid);
            if (!this.user.own(pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
            // eslint-disable-next-line no-await-in-loop
            await problem.edit(domainId, pid, { hidden: true });
        }
        this.back();
    }

    @param('pids', Types.NumericArray)
    async postUnhide(domainId: string, pids: number[]) {
        for (const pid of pids) {
            // eslint-disable-next-line no-await-in-loop
            const pdoc = await problem.get(domainId, pid);
            if (!pdoc) throw new ProblemNotFoundError(domainId, pid);
            if (!this.user.own(pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
            // eslint-disable-next-line no-await-in-loop
            await problem.edit(domainId, pid, { hidden: false });
        }
        this.back();
    }
}

export class ProblemMistakeHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    @param('status', Types.Range(['review', 'mastered', 'all']), true)
    async get(domainId: string, page = 1, status: 'review' | 'mastered' | 'all' = 'review') {
        const mistakeQuery: Filter<mistake.MistakeDoc> = { uid: this.user._id };
        if (status !== 'all') mistakeQuery.status = status;
        const [mdocs, ppcount, mcount] = await mistake.getPage(
            domainId, mistakeQuery, page, this.ctx.setting.get('pagination.problem') || 20,
        );
        const pids = mdocs.map((mdoc) => mdoc.pid);
        const [pdict, psdict] = await Promise.all([
            problem.getList(domainId, pids, this.user._id, false, problem.PROJECTION_LIST, true),
            problem.getListStatus(domainId, this.user._id, pids),
        ]);
        const problemUrls: Record<number, string> = {};
        const practiceAllowed: Record<number, boolean> = {};
        await Promise.all(mdocs.map(async (mdoc) => {
            if (pdict[mdoc.pid]) {
                problemUrls[mdoc.pid] = this.url('problem_detail', { pid: pdict[mdoc.pid].pid || mdoc.pid });
                practiceAllowed[mdoc.pid] = true;
                return;
            }
            if (!mdoc.homeworkId) return;
            const pdoc = await problem.get(domainId, mdoc.pid);
            if (!pdoc) return;
            const source = await loadMistakeHomework(this.user, domainId, mdoc, pdoc);
            if (!source) return;
            pdict[mdoc.pid] = pick(pdoc, problem.PROJECTION_LIST) as ProblemDoc;
            problemUrls[mdoc.pid] = this.url('problem_detail', { pid: pdoc.pid || mdoc.pid, query: { tid: source.homework.docId } });
            practiceAllowed[mdoc.pid] = contest.isOngoing(source.homework, source.status);
        }));
        const visibleMdocs = mdocs.filter((mdoc) => pdict[mdoc.pid]);
        this.response.template = 'problem_mistake.html';
        this.response.body = {
            page,
            ppcount,
            mcount,
            mdocs: visibleMdocs,
            pdict,
            psdict,
            problemUrls,
            practiceAllowed,
            status,
            page_name: 'problem_mistake',
            title: this.translate('problem_mistake'),
        };
    }
}

export class ProblemRandomHandler extends Handler {
    @param('q', Types.Content, true)
    async get(domainId: string, qs = '') {
        const category = flattenDeep(qs.split(' ')
            .filter((i) => i.startsWith('category:'))
            .map((i) => i.split('category:')[1]?.split(',')));
        const q = buildQuery(this.user);
        if (category.length) q.$and = category.map((tag) => ({ tag }));
        await this.ctx.parallel('problem/list', q, this);
        const pid = await problem.random(domainId, q);
        if (!pid) throw new NoProblemError();
        this.response.body = { pid };
        this.response.redirect = this.url('problem_detail', { pid });
    }
}

export class OnlineIdeHandler extends Handler {
    getAllowedLangs(pdoc: ProblemDoc, ddoc: DomainDoc | null) {
        if (!pdoc || typeof pdoc.config === 'string') return [];
        const limits = [];
        if (pdoc.config.langs?.length) limits.push(pdoc.config.langs);
        if (ddoc?.langs) limits.push(ddoc.langs.split(',').map((i) => i.trim()).filter((i) => i));
        const needHiddenLangs = flattenDeep(limits).length;
        const baseLangs = Object.keys(setting.langs).filter((i) =>
            (needHiddenLangs ? !setting.langs[i].remote : !setting.langs[i].remote && !setting.langs[i].hidden)
            && !setting.langs[i].disabled);
        return ['objective', 'submit_answer'].includes(pdoc.config.type) ? ['_'] : intersection(baseLangs, ...limits);
    }

    pickCodeLang(pdoc: ProblemDoc, ddoc: DomainDoc | null) {
        const langs = this.getAllowedLangs(pdoc, ddoc);
        return pickPreferredCodeLang(langs, this.user, ddoc);
    }

    async findHostPdoc(domainId: string, problemQuery: Filter<ProblemDoc>) {
        const ddoc = await domain.get(domainId);
        const preferredCodeLang = getDomainDefaultCodeLang(ddoc) || this.user.codeLang;
        const pdocs = await problem.getMulti(domainId, problemQuery, ['docId'])
            .sort({ sort: 1, docId: 1 }).limit(200).toArray();
        const isRunnable = (pdoc: ProblemDoc | null) => !!(pdoc
            && !pdoc.reference
            && typeof pdoc.config !== 'string'
            && pdoc.config?.type === 'default'
            && pdoc.data?.length);
        let pdoc: ProblemDoc | null = null;
        let score = -1;
        for (const doc of pdocs) {
            // eslint-disable-next-line no-await-in-loop
            const fullPdoc = await problem.get(domainId, doc.docId);
            if (!isRunnable(fullPdoc)) continue;
            const langs = this.getAllowedLangs(fullPdoc, ddoc);
            if (!langs.length) continue;
            const currentScore = langs.includes(preferredCodeLang) ? 4
                : langs.includes('py.py3') ? 3
                    : typeof fullPdoc.config !== 'string' && !fullPdoc.config?.langs?.length ? 2 : 1;
            if (currentScore > score) {
                pdoc = fullPdoc;
                score = currentScore;
                if (currentScore >= 4) break;
            }
        }
        return pdoc;
    }

    async get() {
        const domainId = this.args.domainId;
        const problemQuery = buildQuery(this.user);
        await this.ctx.parallel('problem/list', problemQuery, this);
        const pdoc = await this.findHostPdoc(domainId, problemQuery);
        if (!pdoc && domainId === 'system') {
            const dudict = await domain.getDictUserByDomainId(this.user._id);
            let domainIds = Object.keys(dudict).filter((id) => id !== 'system');
            if (this.user.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN)) {
                const allDomains = await domain.getMulti({ _id: { $ne: 'system' } })
                    .project<{ _id: string }>({ _id: 1 }).toArray();
                domainIds = Array.from(new Set([...domainIds, ...allDomains.map((ddoc) => ddoc._id)]));
            }
            for (const target of domainIds) {
                // eslint-disable-next-line no-await-in-loop
                if (await this.findHostPdoc(target, problemQuery)) {
                    this.response.redirect = this.url('online_ide', { domainId: target });
                    return;
                }
            }
        }
        if (!pdoc) throw new NoProblemError();
        const ddoc = await domain.get(domainId);
        if (typeof pdoc.config === 'string') throw new NoProblemError();
        const ideAllowedLangs = this.getAllowedLangs(pdoc, ddoc);
        const hostPdoc = {
            ...pdoc,
            config: {
                ...pdoc.config,
                langs: ideAllowedLangs,
            },
        };
        this.response.template = 'online_ide.html';
        this.response.body.hostPdoc = hostPdoc;
        this.response.body.ideAllowedLangs = ideAllowedLangs;
        this.response.body.ideCodeLang = this.pickCodeLang(pdoc, ddoc);
        this.response.body.cppEditorMode = getCppEditorMode(this.user);
        this.response.body.cppStarterTemplate = getCppEditorMode(this.user) === 'preset' ? CPP_STARTER_TEMPLATE : '';
    }
}

function isScratchObjectiveTeacher(handler: Handler) {
    return isScratchDomain(handler.domain) && handler.user.hasPerm(PERM.PERM_EDIT_DOMAIN);
}

function checkObjectiveAuthoring(handler: Handler) {
    if (isScratchDomain(handler.domain)) handler.checkPerm(PERM.PERM_EDIT_DOMAIN);
    else {
        handler.checkPerm(PERM.PERM_VIEW_PROBLEM);
        handler.checkPerm(PERM.PERM_CREATE_PROBLEM);
    }
}

export class ProblemDetailHandler extends ContestDetailBaseHandler {
    pdoc: ProblemDoc;
    udoc: User;
    psdoc: ProblemStatusDoc;
    mistakePromptState: Awaited<ReturnType<typeof getMistakePromptState>>;
    reviewMistakeStudent?: User;

    @route('pid', Types.ProblemId, true)
    @query('tid', Types.ObjectId, true)
    @query('reviewUid', Types.PositiveInt, true)
    @query('fromRecord', Types.ObjectId, true)
    @query('mergedUid', Types.PositiveInt, true)
    @query('answerSheet', Types.Boolean)
    async _prepare(
        domainId: string, pid: number | string, tid?: ObjectId, reviewUid?: number,
        fromRecord?: ObjectId, mergedUid?: number, answerSheet = false,
    ) {
        const isReadRequest = ['GET', 'HEAD'].includes((this.request.method || 'GET').toUpperCase());
        const isReviewMistakeAction = !isReadRequest && this.constructor === ProblemDetailHandler
            && this.request.body?.operation === 'add_review_mistake' && reviewUid !== undefined
            && this.request.body?.reviewUid === undefined && this.request.body?.uid === undefined
            && this.request.body?.tid === undefined && this.request.body?.mergedUid === undefined
            && this.request.body?.fromRecord === undefined && mergedUid === undefined && !fromRecord;
        if (!isReadRequest && !isReviewMistakeAction) rejectHomeworkReviewMutation(this.request);
        else {
            assertRecordReplayRequest(fromRecord, tid, reviewUid, mergedUid);
            if (answerSheet && !fromRecord) throw new ValidationError('answerSheet');
        }
        this.pdoc = await problem.get(domainId, pid);
        if (!this.pdoc) throw new ProblemNotFoundError(domainId, pid);
        tid ||= this.tdoc?.docId;
        // Check before the contest branch: possession of a contest link never exposes a source question.
        if (problem.isObjectiveSource(this.pdoc)) {
            checkObjectiveAuthoring(this);
        }
        const reviewStudent = reviewUid === undefined ? null
            : await authorizeHomeworkReview(this.user, this.domain, this.tdoc, this.pdoc.docId, reviewUid);
        if (isReviewMistakeAction) this.reviewMistakeStudent = reviewStudent;
        if (reviewStudent) this.tsdoc = await contest.getStatus(domainId, tid, reviewUid);
        if (tid) {
            if (!this.tdoc?.pids?.includes(this.pdoc.docId)) throw new ContestNotFoundError(domainId, tid);
            if (!reviewStudent && this.tdoc.rule === 'homework'
                && !await canAccessHomeworkProblem(this.user, domainId, this.pdoc, this.tdoc, this.tsdoc)) {
                throw new PermissionError(PERM.PERM_VIEW_HOMEWORK);
            }
            if (!reviewStudent && contest.isNotStarted(this.tdoc)) throw new ContestNotLiveError(tid);
            if (!reviewStudent && !contest.isDone(this.tdoc, this.tsdoc) && (!this.tsdoc?.attend || !this.tsdoc.startAt)) {
                throw new ContestNotAttendedError(tid);
            }
            // Delete problem-related info in contest mode
            this.pdoc.tag.length = 0;
            delete this.pdoc.nAccept;
            delete this.pdoc.nSubmit;
            delete this.pdoc.difficulty;
            delete this.pdoc.stats;
        } else if (!isScratchObjectiveTeacher(this) && !problem.canViewBy(this.pdoc, this.user)) {
            throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }
        let ddoc = this.domain;
        if (this.pdoc.reference) {
            ddoc = await domain.get(this.pdoc.reference.domainId);
            const pdoc = await problem.get(this.pdoc.reference.domainId, this.pdoc.reference.pid);
            if (!ddoc || !pdoc) throw new ProblemNotFoundError(this.pdoc.reference.domainId, this.pdoc.reference.pid);
            if (problem.isObjectiveSource(pdoc)) throw new ProblemNotFoundError(this.pdoc.reference.domainId, this.pdoc.reference.pid);
            this.pdoc.config = pdoc.config;
            this.pdoc.additional_file = pdoc.additional_file;
        }
        if (typeof this.pdoc.config !== 'string') {
            let baseLangs;
            const t = [];
            if (this.pdoc.config.langs) t.push(this.pdoc.config.langs);
            if (ddoc.langs) t.push(ddoc.langs.split(',').map((i) => i.trim()).filter((i) => i));
            if (this.domain.langs) t.push(this.domain.langs.split(',').map((i) => i.trim()).filter((i) => i));
            if (this.tdoc?.langs?.length) t.push(this.tdoc.langs);
            if (this.pdoc.config.type === 'remote_judge') {
                const p = this.pdoc.config.subType;
                const dl = Object.keys(setting.langs).filter((i) => i.startsWith(`${p}.`) || setting.langs[i].validAs[p]);
                if (setting.langs[p]) dl.push(p);
                baseLangs = dl;
            } else {
                const needHiddenLangs = flattenDeep(t).length;
                baseLangs = Object.keys(setting.langs).filter((i) =>
                    (needHiddenLangs ? !setting.langs[i].remote : !setting.langs[i].remote && !setting.langs[i].hidden));
            }
            this.pdoc.config.langs = ['objective', 'submit_answer'].includes(this.pdoc.config.type) ? ['_'] : intersection(baseLangs, ...t);
        }
        await this.ctx.parallel('problem/get', this.pdoc, this);
        [this.psdoc, this.udoc] = await Promise.all([
            problem.getStatus(domainId, this.pdoc.docId, reviewStudent?._id || this.user._id),
            user.getById(domainId, this.pdoc.owner),
        ]);
        const [scnt, dcnt] = await Promise.all([
            solution.count(domainId, { parentId: this.pdoc.docId }),
            discussion.count(domainId, { parentId: this.pdoc.docId }),
        ]);
        const isProgrammingProblem = !!this.pdoc.config && typeof this.pdoc.config === 'object'
            && !['objective', 'submit_answer'].includes(this.pdoc.config.type);
        const preferredCodeDomain = this.tdoc?.allDomains && this.entryDomain ? this.entryDomain : this.domain;
        const codeLang = this.pdoc.config && typeof this.pdoc.config === 'object'
            ? pickPreferredCodeLang(this.pdoc.config.langs || [], this.user, preferredCodeDomain)
            : this.user.codeLang;
        const canUseMistake = (!tid || this.tdoc?.rule === 'homework') && !reviewStudent && !fromRecord && mergedUid === undefined
            && isProgrammingProblem && !problem.isObjectiveSource(this.pdoc) && this.user.hasPerm(PERM.PERM_SUBMIT_PROBLEM);
        const mistakeActionUrl = this.url('problem_detail', {
            pid: this.pdoc.docId, query: tid ? { tid } : {},
        });
        const mistakeDoc = canUseMistake
            ? await mistake.get(domainId, this.user._id, this.pdoc.docId)
            : null;
        let showMistakePrompt = false;
        if (canUseMistake) {
            this.mistakePromptState = await getMistakePromptState(domainId, this.user._id, this.pdoc.docId, tid);
            showMistakePrompt = !mistakeDoc && this.mistakePromptState.eligible
                && Date.now() - this.mistakePromptState.latestSubmitAt <= 10 * Time.minute;
        }
        this.UiContext.canManageProblemSidebar = canManageRecordList(this.user);
        this.response.body = {
            pdoc: this.pdoc,
            udoc: this.udoc,
            psdoc: tid ? null : this.psdoc,
            badgeAcTheme: await getActiveBadgeAcTheme(this.ctx, this.user, this.url.bind(this), this.domain),
            badgeAcFirstEligible: this.psdoc?.status !== STATUS.STATUS_ACCEPTED,
            mistakeDoc,
            mistakePractice: mistake.getPracticeState(mistakeDoc, this.request.query.mistakePractice),
            isMistakeSupported: isProgrammingProblem,
            canUseMistake,
            mistakeActionUrl,
            codeLang,
            cppEditorMode: getCppEditorMode(this.user),
            cppStarterTemplate: getCppEditorMode(this.user) === 'preset' ? CPP_STARTER_TEMPLATE : '',
            showMistakePrompt,
            title: this.pdoc.title,
            solutionCount: scnt,
            discussionCount: dcnt,
            tdoc: this.tdoc,
            owner_udoc: (tid && this.tdoc.owner !== this.pdoc.owner) ? await user.getById(domainId, this.tdoc.owner) : null,
            mode: reviewStudent || mergedUid !== undefined ? 'review' : !tid ? 'normal'
                : !this.tsdoc?.attend ? 'view'
                    : !contest.isDone(this.tdoc) ? 'contest'
                        : problem.canViewBy(this.pdoc, this.user) ? 'correction' : 'none',
        };
        if (reviewStudent) {
            const isObjective = typeof this.pdoc.config === 'object' && this.pdoc.config?.type === 'objective';
            const rdoc = isObjective ? null : await loadHomeworkReviewRecord(domainId, this.pdoc.docId, reviewUid, this.tdoc, this.tsdoc);
            this.UiContext.homeworkReview = {
                uid: reviewUid,
                name: reviewStudent.displayName || reviewStudent.uname,
                rid: rdoc?._id.toString() || '',
                code: rdoc?.code || '',
                lang: rdoc?.lang || '',
                record: publicHomeworkReviewRecord(rdoc),
                returnUrl: this.url('homework_detail', { tid, query: { uid: reviewUid } }),
                ownAnswerUrl: problem.canViewBy(this.pdoc, this.user)
                    ? this.url('problem_detail', { domainId, pid: this.pdoc.pid || this.pdoc.docId }) : '',
            };
            this.response.body.homeworkReview = this.UiContext.homeworkReview;
            if (isProgrammingProblem && !problem.isObjectiveSource(this.pdoc)) {
                const reviewMistake = await mistake.get(domainId, reviewStudent._id, this.pdoc.docId);
                this.UiContext.homeworkReviewMistake = {
                    url: this.url('problem_detail', { pid: this.pdoc.docId, query: { tid, reviewUid: reviewStudent._id } }),
                    studentName: reviewStudent.displayName || reviewStudent.uname,
                    added: !!reviewMistake && reviewMistake.status !== 'mastered',
                };
            }
            if (isObjective) {
                const [records, { config }] = await Promise.all([
                    loadHomeworkReviewRecords(domainId, this.pdoc.docId, reviewUid, this.tdoc),
                    loadObjectiveSubmissionConfig(domainId, this.pdoc.docId),
                ]);
                this.UiContext.objectiveMergedReview = buildObjectiveMergedReview(records, config, {
                    uid: reviewUid, name: reviewStudent.displayName || reviewStudent.uname,
                });
            }
        }
        if (isReadRequest && !tid && !reviewStudent && canUseProblemRecordPicker(this.user)) {
            this.UiContext.problemRecordPicker = {
                url: this.url('problem_submission_records', { domainId, pid: this.pdoc.pid || this.pdoc.docId }),
                ownUrl: this.url('problem_detail', { domainId, pid: this.pdoc.pid || this.pdoc.docId }),
                allowMerged: typeof this.pdoc.config === 'object' && this.pdoc.config?.type === 'objective',
            };
        }
        if (isReadRequest && fromRecord) {
            this.UiContext.recordReplay = await loadProblemRecordReplay(this, domainId, this.pdoc, fromRecord);
            if (answerSheet) {
                if (!this.UiContext.recordReplay.objective) throw new ValidationError('answerSheet');
                this.UiContext.objectiveAnswerSheet = { rid: this.UiContext.recordReplay.rid };
                this.UiContext.objectiveInitialSubmission = this.UiContext.recordReplay.objective;
            }
        }
        if (isReadRequest && mergedUid !== undefined) {
            this.UiContext.objectiveMergedReview = await loadProblemMergedReview(this, domainId, this.pdoc, mergedUid);
        }
        if (isReadRequest) {
            const correctAnswers = await loadObjectiveCorrectAnswers(this.user, domainId, this.pdoc);
            if (correctAnswers) this.UiContext.objectiveCorrectAnswers = correctAnswers;
        }
        if (this.tdoc && this.tsdoc) {
            const fields = ['attend', 'startAt'];
            if (this.tdoc.duration) fields.push('endAt');
            if (contest.canShowSelfRecord.call(this, this.tdoc, true)) fields.push('detail');
            this.tsdoc = pick(this.tsdoc, fields);
            this.response.body.tsdoc = this.tsdoc;
        }
        this.response.template = 'problem_detail.html';
        this.UiContext.extraTitleContent = this.pdoc.title;
    }

    @query('tid', Types.ObjectId, true)
    @query('pjax', Types.Boolean)
    async get(...args: any[]) {
        // Navigate to current additional file download
        // e.g. ![img](file://a.jpg) will navigate to ![img](./pid/file/a.jpg)
        if (!this.request.json || args[2]) {
            this.response.body.pdoc.content = this.response.body.pdoc.content
                .replace(/file:\/\/([^ \n)\\"]+)/g, (str: string) => {
                    const info = str.match(/file:\/\/([^ \n)\\"]+)/);
                    const fileinfo = info[1];
                    let filename = fileinfo.split('?')[0]; // remove querystring
                    try {
                        filename = decodeURIComponent(filename);
                    } catch (e) { }
                    if (!this.pdoc.additional_file?.find((i) => i.name === filename)) return str;
                    if (!args[1]) return `./${this.pdoc.docId}/file/${fileinfo}`;
                    return `./${this.pdoc.docId}/file/${fileinfo}${fileinfo.includes('?') ? '&' : '?'}tid=${args[1]}`;
                });
        }
        this.response.body.page_name = this.tdoc
            ? this.tdoc.rule === 'homework'
                ? 'homework_detail_problem'
                : 'contest_detail_problem'
            : 'problem_detail';
        if (args[2]) {
            const data = { pdoc: this.pdoc, tdoc: this.tdoc };
            this.response.body = {
                title: this.renderTitle(this.response.body.page_name),
                fragments: [
                    { html: await this.renderHTML('partials/problem_description.html', data) },
                ],
                raw: data,
            };
        }
        if (!this.response.body.tdoc) {
            if (this.psdoc?.rid) {
                this.response.body.rdoc = await record.get(this.args.domainId, this.psdoc.rid);
            }
            [this.response.body.ctdocs, this.response.body.htdocs] = (await Promise.all([
                contest.getRelated(this.args.domainId, this.pdoc.docId),
                contest.getRelated(this.args.domainId, this.pdoc.docId, 'homework'),
            ])).map((tdocs) => tdocs.filter((tdoc) =>
                canViewContestLevel(this.user, tdoc) && (this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST) || !tdoc.assign?.length
                    || new Set(tdoc.assign).intersection(new Set(this.user.group)).size),
            ));
        }
        if (!this.UiContext.homeworkReview && !this.UiContext.recordReplay && !this.UiContext.objectiveMergedReview && !args[2]
            && typeof this.pdoc.config === 'object' && this.pdoc.config?.type === 'objective') {
            const initialSubmission = await loadOwnObjectiveSubmission(this, this.args.domainId, this.pdoc, args[1]);
            if (initialSubmission) this.UiContext.objectiveInitialSubmission = initialSubmission;
        }
    }

    @param('pid', Types.UnsignedInt)
    async postRejudge(domainId: string, pid: number) {
        this.checkPerm(PERM.PERM_REJUDGE_PROBLEM);
        if (!this.pdoc.config || typeof this.pdoc.config === 'string') throw new ProblemConfigError();
        const rdocs = await record.getMulti(domainId, {
            pid,
            contest: { $nin: [record.RECORD_GENERATE, record.RECORD_PRETEST] },
            status: { $ne: STATUS.STATUS_CANCELED },
            'files.hack': { $exists: false },
        }).project({ _id: 1, contest: 1 }).toArray();
        if (rdocs.length) {
            const priority = await record.submissionPriority(this.user._id, -10000 - rdocs.length * 5 - 50);
            await record.reset(domainId, rdocs.map((rdoc) => rdoc._id), true);
            await Promise.all([
                record.judge(domainId, rdocs.filter((i) => i.contest).map((i) => i._id), priority, { detail: false }, { rejudge: true }),
                record.judge(domainId, rdocs.filter((i) => !i.contest).map((i) => i._id), priority, {}, { rejudge: true }),
            ]);
        }
        this.back();
    }

    async postDelete() {
        if (!this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const tdocs = await contest.getRelated(this.args.domainId, this.pdoc.docId);
        if (tdocs.length) throw new ProblemAlreadyUsedByContestError(this.pdoc.docId, tdocs[0]._id);
        await problem.del(this.pdoc.domainId, this.pdoc.docId);
        this.response.redirect = this.url('problem_main');
    }

    @param('star', Types.Boolean)
    async postStar(domainId: string, star: boolean) {
        await problem.setStar(domainId, this.pdoc.docId, this.user._id, star);
        this.back({ star });
    }

    @param('rid', Types.ObjectId)
    async postMistakePrompt(domainId: string, rid: ObjectId) {
        this.checkPerm(PERM.PERM_SUBMIT_PROBLEM);
        const state = this.mistakePromptState;
        this.response.body = {
            showMistakePrompt: !!this.response.body.canUseMistake && !this.response.body.mistakeDoc
                && !!state?.eligible && state.latestRid === rid.toString(),
        };
    }

    async postAddMistake() {
        this.checkPerm(PERM.PERM_SUBMIT_PROBLEM);
        if (!this.response.body.canUseMistake) throw new ValidationError('mistake');
        if (!this.pdoc.config || typeof this.pdoc.config !== 'object' || ['objective', 'submit_answer'].includes(this.pdoc.config.type)) {
            throw new ValidationError('type');
        }
        await mistake.add(this.args.domainId, this.user._id, this.pdoc.docId, 'manual', this.tdoc?.docId);
        this.back({ mistakeStatus: 'review' });
    }

    async postAddReviewMistake() {
        if (!this.reviewMistakeStudent || !this.UiContext.homeworkReviewMistake) throw new ValidationError('reviewUid');
        const student = await authorizeHomeworkReview(this.user, this.domain, this.tdoc, this.pdoc.docId, this.reviewMistakeStudent._id);
        await mistake.add(this.args.domainId, student._id, this.pdoc.docId, 'manual', this.tdoc.docId);
        this.back({ reviewMistakeAdded: true, mistakeStudentName: student.displayName || student.uname });
    }

    private checkMistakePractice() {
        this.checkPerm(PERM.PERM_SUBMIT_PROBLEM);
        if ((this.tdoc || this.args.tid) && (this.tdoc?.rule !== 'homework' || !this.response.body?.canUseMistake
            || !contest.isOngoing(this.tdoc, this.tsdoc))) throw new ValidationError('tid');
        if (this.args.reviewUid !== undefined || this.args.fromRecord !== undefined || this.args.mergedUid !== undefined) {
            throw new ValidationError('mistake');
        }
        if (!this.pdoc.config || typeof this.pdoc.config !== 'object' || ['objective', 'submit_answer'].includes(this.pdoc.config.type)) {
            throw new ValidationError('type');
        }
    }

    async postStartMistakePractice() {
        this.checkMistakePractice();
        const mdoc = await mistake.startPractice(this.args.domainId, this.user._id, this.pdoc.docId);
        if (!mdoc) throw new ValidationError('mistake');
        this.response.redirect = this.url('problem_detail', {
            domainId: this.args.domainId,
            pid: this.pdoc.pid || this.pdoc.docId,
            query: { scratchpad: '1', mistakePractice: mdoc.practiceToken, ...(this.tdoc ? { tid: this.tdoc.docId } : {}) },
        });
    }

    @param('practiceToken', Types.String)
    async postDeepenMistake(domainId: string, practiceToken: string) {
        this.checkMistakePractice();
        const mdoc = await mistake.deepen(this.args.domainId, this.user._id, this.pdoc.docId, practiceToken);
        if (!mdoc) throw new ValidationError('practiceToken');
        this.back({ importance: mdoc.importance, deepened: true });
    }

    async postMasterMistake() {
        this.checkPerm(PERM.PERM_SUBMIT_PROBLEM);
        if (!this.response.body.canUseMistake) throw new ValidationError('mistake');
        await mistake.master(this.args.domainId, this.user._id, this.pdoc.docId);
        this.back({ mistakeStatus: 'mastered' });
    }
}

export class ProblemSubmitHandler extends ProblemDetailHandler {
    @param('tid', Types.ObjectId, true)
    async prepare(domainId: string, tid?: ObjectId) {
        rejectHomeworkReviewMutation(this.request);
        if (!this.tdoc?.allDomains) this.checkPerm(PERM.PERM_SUBMIT_PROBLEM);
        else this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (tid && !contest.isOngoing(this.tdoc, this.tsdoc)) throw new ContestNotLiveError(this.tdoc.docId);
        if (typeof this.pdoc.config === 'string') throw new ProblemConfigError();
        if (this.pdoc.config.langs && !this.pdoc.config.langs.length) throw new ProblemConfigError();
    }

    async get() {
        this.response.template = 'problem_submit.html';
        const langRange = (typeof this.pdoc.config === 'object' && this.pdoc.config.langs)
            ? Object.fromEntries(this.pdoc.config.langs.map((i) => [i, setting.langs[i]?.display || i]))
            : setting.SETTINGS_BY_KEY.codeLang.range;
        this.response.body.langRange = langRange;
        const preferredCodeDomain = this.tdoc?.allDomains && this.entryDomain ? this.entryDomain : this.domain;
        this.response.body.codeLang = pickPreferredCodeLang(Object.keys(langRange || {}), this.user, preferredCodeDomain);
        this.response.body.page_name = this.tdoc
            ? this.tdoc.rule === 'homework'
                ? 'homework_detail_problem_submit'
                : 'contest_detail_problem_submit'
            : 'problem_submit';
    }

    @param('lang', Types.Name)
    @param('code', Types.String, true)
    @param('pretest', Types.Boolean)
    @param('input', Types.ArrayOf(Types.String, true), true)
    @param('source', Types.String, true)
    @param('tid', Types.ObjectId, true)
    async post(
        domainId: string, lang: string, code: string, pretest = false, input: string[] = [], source = '', tid?: ObjectId,
    ) {
        rejectHomeworkReviewMutation(this.request);
        const config = this.pdoc.config;
        const submittedLang = lang;
        if (typeof config === 'string' || config === null) throw new ProblemConfigError();
        if (['submit_answer', 'objective'].includes(config.type)) {
            lang = '_';
        } else if ((config.langs && !config.langs.includes(lang)) || !setting.langs[lang] || setting.langs[lang].disabled) {
            throw new ProblemNotAllowLanguageError();
        }
        if (pretest) {
            if (setting.langs[lang]?.pretest) lang = setting.langs[lang].pretest as string;
            if (!['default', 'remote_judge'].includes(this.response.body.pdoc.config?.type)) {
                throw new ProblemNotAllowPretestError('type');
            }
            if (!input.length) throw new ValidationError('input');
            input = input.map((i) => i || '');
        }
        await this.limitRate('add_record', 60, system.get('limit.submission_user'), '{{user}}');
        await this.limitRate('add_record', 60, pretest ? system.get('limit.pretest') : system.get('limit.submission'));
        const files: Record<string, string> = {};
        const lengthLimit = system.get('limit.codelength') || 128 * 1024;
        // Beginner mode deliberately keeps Scratchpad free of C++ boilerplate.
        // The source marker leaves the conventional submit page and file uploads
        // untouched, while still allowing an empty beginner editor to run.
        const isBeginnerScratchpadCpp = source === 'scratchpad'
            && getCppEditorMode(this.user) === 'beginner'
            && (isCppLanguage(submittedLang) || isCppLanguage(lang));
        if (isBeginnerScratchpadCpp) {
            code = (code || '').replace(/\r\n/g, '\n');
            if (!isCompleteCppTranslationUnit(code)) code = wrapBeginnerCppCode(code);
            if (code.length > lengthLimit) throw new ValidationError('code');
        } else if (!code) {
            const file = this.request.files?.file;
            if (!file || file.size === 0) throw new ValidationError('code');
            const sizeLimit = config.type === 'submit_answer' ? 128 * 1024 * 1024 : lengthLimit;
            if (file.size > sizeLimit) throw new FileTooLargeError('file');
            const shouldReadFile = () => {
                if (config.type === 'objective') return true;
                if (lang === '_') return false;
                return file.size < lengthLimit && !file.filepath.endsWith('.zip') && !setting.langs[lang].isBinary;
            };
            if (shouldReadFile()) code = await readFile(file.filepath, 'utf-8');
            else {
                const id = nanoid();
                await storage.put(`submission/${this.user._id}/${id}`, file.filepath, this.user._id);
                files.code = `${this.user._id}/${id}#${file.originalFilename}`;
            }
        } else {
            code = code.replace(/\r\n/g, '\n');
            if (code.length > lengthLimit) throw new ValidationError('code');
        }
        const rid = await record.add(
            domainId, this.pdoc.docId, this.user._id, lang, code, true,
            pretest ? { input, type: 'pretest' } : { contest: tid, files, type: 'judge' },
        );
        if (!pretest) {
            await Promise.all([
                problem.inc(domainId, this.pdoc.docId, 'nSubmit', 1),
                domain.incUserInDomain(domainId, this.user._id, 'nSubmit'),
                tid && contest.updateStatus(domainId, tid, this.user._id, rid, this.pdoc.docId),
            ]);
        }
        if (tid && !pretest && !contest.canShowSelfRecord.call(this, this.tdoc)) {
            // The regular record page remains hidden for contests that do not expose
            // submissions, but the editor still needs this id for its own result prompt.
            this.response.body = { rid, tid };
            this.response.redirect = this.url(this.tdoc.rule === 'homework' ? 'homework_detail' : 'contest_problemlist', {
                tid,
                query: this.contestEntryQuery,
            });
        } else {
            this.response.body = { rid };
            this.response.redirect = this.url('record_detail', {
                rid,
                query: {
                    badgeAcEffect: this.psdoc?.status === STATUS.STATUS_ACCEPTED ? '0' : '1',
                },
            });
        }
    }
}

export class ProblemHackHandler extends ProblemDetailHandler {
    rdoc: RecordDoc;

    @param('rid', Types.ObjectId)
    @param('tid', Types.ObjectId, true)
    async prepare(domainId: string, rid: ObjectId, tid?: ObjectId) {
        if (typeof this.pdoc.config !== 'object' || !this.pdoc.config.hackable) throw new HackFailedError('This problem is not hackable.');
        this.rdoc = await record.get(domainId, rid);
        if (!this.rdoc || this.rdoc.pid !== this.pdoc.docId
            || this.rdoc.contest?.toString() !== tid?.toString()) throw new RecordNotFoundError(domainId, rid);
        if (!(await canViewRecordOwner(this.user, this.rdoc.uid))) throw new RecordNotFoundError(domainId, rid);
        if (tid) {
            if (this.tdoc.rule !== 'codeforces') throw new HackFailedError('This contest is not hackable.');
            if (!contest.isOngoing(this.tdoc, this.tsdoc)) throw new ContestNotLiveError(this.tdoc.docId);
        }
        if (this.rdoc.uid === this.user._id) throw new HackFailedError('You cannot hack your own submission');
        if (this.psdoc?.status !== STATUS.STATUS_ACCEPTED) throw new HackFailedError('You must accept this problem before hacking.');
        if (this.rdoc.status !== STATUS.STATUS_ACCEPTED) throw new HackFailedError('You cannot hack a unsuccessful submission.');
    }

    async get() {
        this.response.template = 'problem_hack.html';
        this.response.body = {
            pdoc: this.pdoc,
            udoc: this.udoc,
            rid: this.rdoc._id,
            title: this.pdoc.title,
            page_name: this.tdoc ? 'contest_detail_problem_hack' : 'problem_hack',
        };
    }

    @param('input', Types.String, true)
    @param('autoOrganizeInput', Types.Boolean, true)
    @param('tid', Types.ObjectId, true)
    async post(domainId: string, input = '', autoOrganizeInput = false, tid?: ObjectId) {
        await this.limitRate('add_record', 60, system.get('limit.submission_user'), '{{user}}');
        await this.limitRate('add_record', 60, system.get('limit.submission'));
        const id = `${this.user._id}/${nanoid()}`;
        if (this.request.files?.file?.size > 0) {
            const file = this.request.files.file;
            if (!file || file.size > 2 * 1024 * 1024) throw new ValidationError('input');
            await storage.put(`submission/${id}`, file.filepath, this.user._id);
        } else if (input) {
            if (autoOrganizeInput) input = input.replace(/\s+\n/g, '\n').replace(/\s+ /g, ' ');
            await storage.put(`submission/${id}`, Buffer.from(input), this.user._id);
        }
        const rid = await record.add(
            domainId, this.pdoc.docId, this.user._id,
            this.rdoc.lang, this.rdoc.code, true,
            {
                contest: tid,
                type: 'hack',
                hackTarget: this.rdoc._id,
                files: { hack: `${id}#input.txt` },
            },
        );
        this.response.body = { rid };
        this.response.redirect = this.url('record_detail', { rid });
    }
}

export class ProblemManageHandler extends ProblemDetailHandler {
    async prepare() {
        if (!isScratchObjectiveTeacher(this) && !this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
    }
}

export class ProblemEditHandler extends ProblemManageHandler {
    async get() {
        this.response.body.additional_file = sortFiles(this.pdoc.additional_file || []);
        this.response.body.statementLangs = this.ctx.i18n.langs(false);
        if (this.pdoc.objectiveKind) {
            checkObjectiveAuthoring(this);
            if (this.pdoc.reference) throw new ProblemIsReferencedError('edit objective question');
            const privateDoc = await problem.get(this.pdoc.domainId, this.pdoc.docId, ['objective']);
            if (!privateDoc?.objective) throw new ProblemConfigError();
            this.response.body.objective = privateDoc.objective;
            this.response.body.page_name = 'problem_edit_objective';
            this.response.template = 'problem_objective_edit.html';
            return;
        }
        this.response.template = 'problem_edit.html';
    }

    @route('pid', Types.ProblemId)
    @post('title', Types.Title)
    @post('content', Types.Content, true)
    @post('pid', Types.ProblemId, true, (i) => /^(?:[a-z0-9]{1,10}-)?[a-z][a-z0-9]*$/i.test(i))
    @post('hidden', Types.Boolean)
    @post('tag', Types.Content, true, null, parseCategory)
    @post('difficulty', Types.PositiveInt, (i) => +i <= 10, true)
    @post('objective', Types.Content, true)
    async post(
        domainId: string, pid: string | number, title: string, content: string,
        newPid: string | number = '', hidden = false, tag: string[] = [], difficulty = 0, objective?: string,
    ) {
        if (typeof newPid !== 'string') newPid = `P${newPid}`;
        if (newPid !== this.pdoc.pid && await problem.get(domainId, newPid)) throw new ProblemAlreadyExistError(newPid);
        if (this.pdoc.objectiveKind) {
            checkObjectiveAuthoring(this);
            if (this.pdoc.reference) throw new ProblemIsReferencedError('edit objective question');
            const question = parseObjective(objective);
            const tags = parseObjectiveTags(tag);
            const statement = objectiveContent(question);
            const config = objectiveConfig(question);
            const original = await problem.get(domainId, this.pdoc.docId, ['objective', 'config'], true);
            if (!original?.objective) throw new ProblemConfigError();
            await copyObjectiveFiles(domainId, this.pdoc.docId, statement, this.user);
            try {
                await problem.addTestdata(domainId, this.pdoc.docId, 'config.yaml', Buffer.from(config), this.user._id);
                await problem.edit(domainId, this.pdoc.docId, {
                    title, content: statement, pid: newPid, hidden: true, tag: tags, difficulty, html: false,
                    objective: question, objectiveKind: question.kind, config,
                });
            } catch (error) {
                // Restore the answer key as well as authoring data if a save only partly succeeded.
                await problem.addTestdata(domainId, this.pdoc.docId, 'config.yaml', Buffer.from(String(original.config || '')), this.user._id);
                await problem.edit(domainId, this.pdoc.docId, {
                    ...pick(this.pdoc, ['title', 'content', 'hidden', 'tag', 'difficulty', 'html', 'objectiveKind']),
                    pid: this.pdoc.pid || '',
                    objective: original.objective,
                    config: original.config,
                });
                throw error;
            }
            this.response.redirect = this.url('problem_objective', {}, { saved: this.pdoc.docId });
            return;
        }
        if (!content) throw new ValidationError('content');
        if (objective) throw new ValidationError('objective');
        const $update: Partial<ProblemDoc> = {
            title, content, pid: newPid, hidden, tag: tag ?? [], difficulty, html: false,
        };
        const pdoc = await problem.edit(domainId, this.pdoc.docId, $update);
        this.response.redirect = this.url('problem_detail', { pid: newPid || pdoc.docId });
    }
}

export class ProblemConfigHandler extends ProblemManageHandler {
    async get() {
        if (this.pdoc.reference) throw new ProblemIsReferencedError('edit config');
        this.response.body.testdata = sortFiles(this.pdoc.data || []);
        const configFile = (this.pdoc.data || []).filter((i) => i.name.toLowerCase() === 'config.yaml');
        this.response.body.config = '';
        if (configFile.length > 0) {
            try {
                this.response.body.config = (await streamToBuffer(
                    await storage.get(`problem/${this.pdoc.domainId}/${this.pdoc.docId}/testdata/${configFile[0].name}`),
                )).toString();
            } catch (e) { /* ignore */ }
        }
        this.response.template = 'problem_config.html';
    }
}

export class ProblemFilesHandler extends ProblemDetailHandler {
    notUsage = true;

    async prepare() {
        if (!isScratchObjectiveTeacher(this)) this.checkPerm(PERM.PERM_VIEW_PROBLEM);
    }

    @param('d', Types.CommaSeperatedArray, true)
    @param('sidebar', Types.Boolean)
    async get({ }, d = ['testdata', 'additional_file'], sidebar = false) {
        if (this.tdoc) throw new ContestNotEndedError();
        this.response.body.testdata = sortFiles(this.pdoc.data || []);
        this.response.body.additional_file = sortFiles(this.pdoc.additional_file || []);
        this.response.body.reference = this.pdoc.reference;
        this.response.pjax = d.map((i) => ['partials/problem_files.html', { filetype: i, sidebar, can_edit: true }]);
        if (!sidebar) this.response.pjax.push(['partials/problem-sidebar-information.html', {}]);
        this.response.template = 'problem_files.html';
    }

    async post() {
        if (this.args.operation === 'get_links') return;
        if (this.pdoc.reference) throw new ProblemIsReferencedError('edit files');
        if (!isScratchObjectiveTeacher(this) && !this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
    }

    @post('files', Types.Set)
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postGetLinks(domainId: string, files: Set<string>, type = 'testdata') {
        if (type === 'testdata' && !this.user.own(this.pdoc)) {
            if (this.pdoc.reference) throw new ProblemIsReferencedError('download testdata.');
            if (!this.user.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA)) this.checkPerm(PERM.PERM_READ_PROBLEM_DATA);
            if (this.tdoc && !contest.isDone(this.tdoc)) throw new ContestNotEndedError(this.tdoc.domainId, this.tdoc.docId);
        }
        if (this.pdoc.reference) this.pdoc = await problem.get(this.pdoc.reference.domainId, this.pdoc.reference.pid);
        const links = {};
        const size = Math.sum(
            this.pdoc[type === 'testdata' ? 'data' : 'additional_file']
                ?.filter((i) => files.has(i.name))
                ?.map((i) => i.size),
        ) || 0;
        await oplog.log(this, 'download.problem.bulk', {
            target: Array.from(files).map((file) => `problem/${this.pdoc.domainId}/${this.pdoc.docId}/${type}/${file}`),
            size,
        });
        for (const file of files) {
            // eslint-disable-next-line no-await-in-loop
            links[file] = await storage.signDownloadLink(
                `problem/${this.pdoc.domainId}/${this.pdoc.docId}/${type}/${file}`,
                file, false, 'user',
            );
        }
        this.response.body.links = links;
    }

    @post('filename', Types.Filename, true)
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postUploadFile(domainId: string, filename: string, type = 'testdata') {
        const file = this.request.files.file;
        if (!file) throw new ValidationError('file');
        filename ||= file.originalFilename || randomstring(16);
        const files = [];
        if (filename.endsWith('.zip') && type === 'testdata') {
            const zip = new ZipReader(Readable.toWeb(createReadStream(file.filepath)));
            let entries: Entry[];
            try {
                entries = await zip.getEntries();
            } catch (e) {
                throw new ValidationError('zip', null, e.message);
            }
            for (const entry of entries) {
                if (!entry.filename || entry.directory === true) continue;
                files.push({
                    type,
                    name: sanitize(entry.filename),
                    size: entry.uncompressedSize,
                    data: () => {
                        const pass = new PassThrough();
                        entry.getData(Writable.toWeb(pass));
                        return pass;
                    },
                });
            }
        } else {
            files.push({
                type,
                name: filename,
                size: file.size,
                data: () => file.filepath,
            });
        }
        if (!this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) {
            if ((this.pdoc.data?.length || 0)
                + (this.pdoc.additional_file?.length || 0)
                + files.length
                >= this.ctx.setting.get('limit.problem_files_max')) {
                throw new FileLimitExceededError('count');
            }
            const size = Math.sum(
                (this.pdoc.data || []).map((i) => i.size),
                (this.pdoc.additional_file || []).map((i) => i.size),
                files.map((i) => i.size),
            );
            if (size >= this.ctx.setting.get('limit.problem_files_max_size')) {
                throw new FileLimitExceededError('size');
            }
        }
        for (const entry of files) {
            const method = entry.type === 'testdata' ? 'addTestdata' : 'addAdditionalFile';
            // eslint-disable-next-line no-await-in-loop
            await problem[method](domainId, this.pdoc.docId, entry.name, entry.data(), this.user._id);
        }
        this.back();
    }

    @post('files', Types.ArrayOf(Types.Filename))
    @post('newNames', Types.ArrayOf(Types.Filename))
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postRenameFiles(domainId: string, files: string[], newNames: string[], type = 'testdata') {
        if (files.length !== newNames.length) throw new ValidationError('files', 'newNames');
        await Promise.all(files.map(async (file, index) => {
            const newName = newNames[index];
            if (type === 'testdata') await problem.renameTestdata(domainId, this.pdoc.docId, file, newName, this.user._id);
            else await problem.renameAdditionalFile(domainId, this.pdoc.docId, file, newName, this.user._id);
        }));
        this.back();
    }

    @post('files', Types.ArrayOf(Types.Filename))
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postDeleteFiles(domainId: string, files: string[], type = 'testdata') {
        if (type === 'testdata') await problem.delTestdata(domainId, this.pdoc.docId, files, this.user._id);
        else await problem.delAdditionalFile(domainId, this.pdoc.docId, files, this.user._id);
        this.back();
    }

    @post('std', Types.Filename)
    @post('gen', Types.Filename)
    async postGenerateTestdata(domainId: string, std: string, gen: string) {
        if (!this.pdoc.data?.find((i) => i.name === std)) throw new BadRequestError();
        if (!this.pdoc.data?.find((i) => i.name === gen)) throw new BadRequestError();
        const rid = await record.add(domainId, this.pdoc.docId, this.user._id, '_', `${gen}\n${std}`, true, {
            type: 'generate',
        });
        this.response.redirect = this.url('record_detail', { rid });
    }
}

export class ProblemFileDownloadHandler extends ProblemDetailHandler {
    @query('type', Types.Range(['additional_file', 'testdata']), true)
    @param('filename', Types.Filename)
    @param('noDisposition', Types.Boolean)
    @query('tid', Types.ObjectId, true)
    async get({ }, type = 'additional_file', filename: string, noDisposition = false, tid: ObjectId) {
        if (!tid && !isScratchObjectiveTeacher(this)) this.checkPerm(PERM.PERM_VIEW_PROBLEM);
        if (this.pdoc.reference) {
            if (type === 'testdata') throw new ProblemIsReferencedError('download testdata');
            this.pdoc = await problem.get(this.pdoc.reference.domainId, this.pdoc.reference.pid);
            if (!this.pdoc) throw new ProblemNotFoundError();
        }
        if (type === 'testdata' && !this.user.own(this.pdoc)) {
            if (!this.user.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA)) this.checkPerm(PERM.PERM_READ_PROBLEM_DATA);
            if (this.tdoc && !contest.isDone(this.tdoc)) throw new ContestNotEndedError(this.tdoc.domainId, this.tdoc.docId);
        }
        const target = `problem/${this.pdoc.domainId}/${this.pdoc.docId}/${type}/${filename}`;
        const file = await storage.getMeta(target);
        await oplog.log(this, 'download.problem.single', {
            target,
            size: file?.size || 0,
        });
        if (type === 'additional_file' && noDisposition && file && isInlineRasterImage(filename, file)
            && await tryRedirectAsset(this, { path: target, meta: file })) return;
        this.response.redirect = await storage.signDownloadLink(
            target, noDisposition ? undefined : filename, false, 'user',
        );
    }
}

export class ProblemSolutionHandler extends ProblemDetailHandler {
    @param('page', Types.PositiveInt, true)
    @param('tid', Types.ObjectId, true)
    @param('sid', Types.ObjectId, true)
    async get(domainId: string, page = 1, tid?: ObjectId, sid?: ObjectId) {
        if (tid) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        this.response.template = 'problem_solution.html';
        const accepted = this.psdoc?.status === STATUS.STATUS_ACCEPTED;
        if (!accepted || !this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT)) {
            this.checkPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        }

        let [psdocs, pcount, pscount] = await this.paginate(
            solution.getMulti(domainId, this.pdoc.docId),
            page,
            'solution',
        );
        if (sid) {
            psdocs = [await solution.get(domainId, sid)];
            if (!psdocs[0]) throw new SolutionNotFoundError(domainId, sid);
        }
        const uids = [this.pdoc.owner];
        const docids = [];
        for (const psdoc of psdocs) {
            docids.push(psdoc.docId);
            uids.push(psdoc.owner);
            if (psdoc.reply.length) {
                for (const psrdoc of psdoc.reply) uids.push(psrdoc.owner);
            }
        }
        const udict = await user.getList(domainId, uids);
        const pssdict = await solution.getListStatus(domainId, docids, this.user._id);
        this.response.body = {
            psdocs, page, pcount, pscount, udict, pssdict, pdoc: this.pdoc, sid,
        };
    }

    @param('content', Types.Content)
    async postSubmit(domainId: string, content: string) {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM_SOLUTION);
        const psid = await solution.add(domainId, this.pdoc.docId, this.user._id, content);
        this.back({ psid });
    }

    @param('content', Types.Content)
    @param('psid', Types.ObjectId)
    async postEditSolution(domainId: string, content: string, psid: ObjectId) {
        let psdoc = await solution.get(domainId, psid);
        if (!this.user.own(psdoc)) this.checkPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION);
        else this.checkPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION_SELF);
        psdoc = await solution.edit(domainId, psdoc.docId, content);
        this.back({ psdoc });
    }

    @param('psid', Types.ObjectId)
    async postDeleteSolution(domainId: string, psid: ObjectId) {
        const psdoc = await solution.get(domainId, psid);
        if (!this.user.own(psdoc)) this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION);
        else this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION_SELF);
        await solution.del(domainId, psdoc.docId);
        this.back();
    }

    @param('psid', Types.ObjectId)
    @param('content', Types.Content)
    async postReply(domainId: string, psid: ObjectId, content: string) {
        this.checkPerm(PERM.PERM_REPLY_PROBLEM_SOLUTION);
        const psdoc = await solution.get(domainId, psid);
        await solution.reply(domainId, psdoc.docId, this.user._id, content);
        this.back();
    }

    @param('psid', Types.ObjectId)
    @param('psrid', Types.ObjectId)
    @param('content', Types.Content)
    async postEditReply(domainId: string, psid: ObjectId, psrid: ObjectId, content: string) {
        const [psdoc, psrdoc] = await solution.getReply(domainId, psid, psrid);
        if (!psdoc || psdoc.parentId !== this.pdoc.docId) throw new SolutionNotFoundError(domainId, psid);
        if (!this.user.own(psrdoc) || !this.user.hasPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF)) {
            throw new PermissionError(PERM.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF);
        }
        await solution.editReply(domainId, psid, psrid, content);
        this.back();
    }

    @param('psid', Types.ObjectId)
    @param('psrid', Types.ObjectId)
    async postDeleteReply(domainId: string, psid: ObjectId, psrid: ObjectId) {
        const [psdoc, psrdoc] = await solution.getReply(domainId, psid, psrid);
        if (!psdoc || psdoc.parentId !== this.pdoc.docId) throw new SolutionNotFoundError(domainId, psid);
        if (!this.user.own(psrdoc) || !this.user.hasPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF)) {
            this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY);
        }
        await solution.delReply(domainId, psid, psrid);
        this.back();
    }

    @param('psid', Types.ObjectId)
    async postUpvote(domainId: string, psid: ObjectId) {
        this.checkPerm(PERM.PERM_VOTE_PROBLEM_SOLUTION);
        const psdoc = await solution.vote(domainId, psid, this.user._id, 1);
        this.back({ vote: psdoc.vote, user_vote: 1 });
    }

    @param('psid', Types.ObjectId)
    async postDownvote(domainId: string, psid: ObjectId) {
        this.checkPerm(PERM.PERM_VOTE_PROBLEM_SOLUTION);
        const psdoc = await solution.vote(domainId, psid, this.user._id, -1);
        this.back({ vote: psdoc.vote, user_vote: -1 });
    }
}

export class ProblemSolutionRawHandler extends ProblemDetailHandler {
    @param('psid', Types.ObjectId)
    @route('psrid', Types.ObjectId, true)
    @param('tid', Types.ObjectId, true)
    async get(domainId: string, psid: ObjectId, psrid?: ObjectId, tid?: ObjectId) {
        if (tid) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        const accepted = this.psdoc?.status === STATUS.STATUS_ACCEPTED;
        if (!accepted || !this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT)) {
            this.checkPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        }
        if (psrid) {
            const [psdoc, psrdoc] = await solution.getReply(domainId, psid, psrid);
            if ((!psdoc) || psdoc.parentId !== this.pdoc.docId) throw new SolutionNotFoundError(psid, psrid);
            this.response.body = psrdoc.content;
        } else {
            const psdoc = await solution.get(domainId, psid);
            this.response.body = psdoc.content;
        }
        this.response.type = 'text/markdown';
    }
}

export class ProblemStatisticsHandler extends ProblemDetailHandler {
    @param('sort', Types.Range(Object.keys(record.STAT_QUERY)), true)
    @param('direction', Types.Range([-1, 1]), true)
    @param('lang', Types.String, true)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, sort = 'time', direction: 1 | -1 = 1, lang?: string, page = 1) {
        if (this.tdoc) throw new ContestNotEndedError();
        const recordQuery = {
            pid: this.pdoc.docId,
            ...lang ? { lang } : {},
        };
        appendHiddenSuperAdminFilter(recordQuery, await getHiddenSuperAdminUids(this.user));
        const [rsdocs, pcount, rscount] = await this.paginate(
            record.getMultiStat(domainId, recordQuery, record.STAT_QUERY[sort][Math.max(direction, 0)]),
            page,
            'record',
        );
        const [udict, udoc] = await Promise.all([
            user.getListForRender(domainId, rsdocs.map((i) => i.uid), this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO)),
            user.getById(domainId, this.pdoc.owner),
        ]);
        this.response.template = 'problem_statistics.html';
        this.response.body = {
            rsdocs, page, pcount, rscount, sort, direction, pdoc: this.pdoc, udict, types: Object.keys(record.STAT_QUERY), udoc,
        };
    }
}

export class ProblemCreateHandler extends Handler {
    @query('type', Types.Range(['traditional']), true)
    async get(domainId: string, type?: string) {
        this.response.template = type === 'traditional' ? 'problem_edit.html' : 'problem_create_select.html';
        this.response.body = {
            page_name: type === 'traditional' ? 'problem_create' : 'problem_create_select',
            statementLangs: this.ctx.i18n.langs(false),
            additional_file: [],
        };
    }

    @post('title', Types.Title)
    @post('content', Types.Content)
    @post('pid', Types.ProblemId, true, (i) => /^(?:[a-z0-9]{1,10}-)?[a-z][a-z0-9]*$/i.test(i))
    @post('hidden', Types.Boolean)
    @post('difficulty', Types.PositiveInt, (i) => +i <= 10, true)
    @post('tag', Types.Content, true, null, parseCategory)
    async post(
        domainId: string, title: string, content: string, pid: string | number = '',
        hidden = false, difficulty = 0, tag: string[] = [],
    ) {
        if (typeof pid !== 'string') pid = `P${pid}`;
        if (pid && await problem.get(domainId, pid)) throw new ProblemAlreadyExistError(pid);
        const docId = await problem.add(domainId, pid, title, content, this.user._id, tag ?? [], { hidden, difficulty });
        const files = new Set(Array.from(content.matchAll(/file:\/\/([\w-]+\.[a-zA-Z0-9]+)/g)).map((i) => i[1]));
        const tasks = [];
        for (const file of files) {
            if (this.user._files.find((i) => i.name === file)) {
                tasks.push(
                    storage.rename(`user/${this.user._id}/${file}`, `problem/${domainId}/${docId}/additional_file/${file}`, this.user._id)
                        .then(() => problem.addAdditionalFile(domainId, docId, file, '', this.user._id, true)),
                    user.setById(this.user._id, { _files: this.user._files.filter((i) => i.name !== file) }),
                );
            }
        }
        await Promise.all(tasks);
        this.response.body = { pid: pid || docId };
        this.response.redirect = this.url('problem_files', { pid: pid || docId });
    }
}

class ObjectiveAuthoringHandler extends Handler {
    async prepare() {
        checkObjectiveAuthoring(this);
    }
}

export class ProblemCreateObjectiveHandler extends ObjectiveAuthoringHandler {
    async get() {
        this.response.template = 'problem_objective_edit.html';
        this.response.body = { page_name: 'problem_create_objective', additional_file: [] };
    }

    @post('title', Types.Title)
    @post('objective', Types.Content)
    @post('pid', Types.ProblemId, true, (i) => /^(?:[a-z0-9]{1,10}-)?[a-z][a-z0-9]*$/i.test(i))
    @post('difficulty', Types.PositiveInt, (i) => +i <= 10, true)
    @post('tag', Types.Content, true, null, parseCategory)
    async post(
        domainId: string, title: string, objective: string, pid: string | number = '',
        difficulty = 0, tag: string[] = [],
    ) {
        const question = parseObjective(objective);
        const tags = parseObjectiveTags(tag);
        const content = objectiveContent(question);
        const config = objectiveConfig(question);
        if (typeof pid !== 'string') pid = `P${pid}`;
        if (pid && await problem.get(domainId, pid)) throw new ProblemAlreadyExistError(pid);
        // Source questions always stay in the teacher's workspace, including legacy callers posting hidden=false.
        const docId = await problem.add(domainId, pid, title, content, this.user._id, tags, {
            hidden: true, difficulty, objective: question, objectiveKind: question.kind,
        });
        try {
            await problem.addTestdata(domainId, docId, 'config.yaml', Buffer.from(config), this.user._id);
            await copyObjectiveFiles(domainId, docId, content, this.user);
            // addTestdata's legacy event listeners run asynchronously; make the configuration
            // immediately available before the new question is visible or the request redirects.
            await problem.edit(domainId, docId, { hidden: true, config });
        } catch (error) {
            await problem.del(domainId, docId);
            throw error;
        }
        this.response.body = { pid: pid || docId };
        this.response.redirect = this.url('problem_objective', {}, { added: docId });
    }
}

export class ProblemObjectiveItemsHandler extends ObjectiveAuthoringHandler {
    @query('q', Types.String, true)
    @query('kind', Types.Range(['single', 'multiple', 'judge']), true)
    @query('tag', Types.String, true)
    @query('page', Types.PositiveInt, true)
    @query('pageSize', Types.PositiveInt, true)
    async get(domainId: string, q = '', kind?: string, tag = '', page = 1, pageSize = 20) {
        if (q.length > 200 || tag.length > 40 || page > 100000) throw new ValidationError('q');
        pageSize = Math.min(pageSize, 50);
        const sourceQuery: Filter<ProblemDoc> = { objectiveKind: { $in: ['single', 'multiple', 'judge'] }, reference: { $exists: false } };
        const filter: Filter<ProblemDoc> = { ...sourceQuery };
        if (kind) filter.objectiveKind = kind as ProblemDoc['objectiveKind'];
        if (tag.trim()) filter.tag = tag.trim();
        if (q.trim()) {
            const regex = new RegExp(escapeRegExp(q.trim()), 'i');
            filter.$or = [{ title: regex }, { pid: regex }, { 'objective.stem': regex }, { tag: regex }];
        }
        const [docs, total, tags] = await Promise.all([
            document.getMulti(domainId, document.TYPE_PROBLEM, filter,
                ['docId', 'pid', 'title', 'tag', 'difficulty', 'objectiveKind', 'objective'])
                .sort({ docId: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
            document.count(domainId, document.TYPE_PROBLEM, filter),
            document.coll.distinct('tag', { domainId, docType: document.TYPE_PROBLEM, ...sourceQuery }),
        ]);
        this.response.body = {
            items: docs.map((doc) => ({
                ...pick(doc, ['docId', 'pid', 'title', 'tag', 'difficulty', 'objectiveKind']),
                objective: doc.objective,
                editUrl: this.url('problem_edit', { pid: doc.pid || doc.docId }),
                fileBaseUrl: this.url('problem_detail', { pid: doc.pid || doc.docId }),
            })),
            total,
            page,
            pageSize,
            tags: tags.filter((value): value is string => typeof value === 'string').sort((a, b) => a.localeCompare(b, 'zh')),
        };
    }
}

export class ProblemObjectiveHandler extends ObjectiveAuthoringHandler {
    async get() {
        this.response.template = 'problem_objective.html';
        this.response.body = { page_name: 'problem_objective' };
    }

    @post('title', Types.Title)
    @post('paper', Types.Content)
    @post('pid', Types.ProblemId, true, (i) => /^(?:[a-z0-9]{1,10}-)?[a-z][a-z0-9]*$/i.test(i))
    @post('content', Types.Content, true)
    @post('tag', Types.Content, true, null, parseCategory)
    async post(domainId: string, title: string, paper: string, pid: string | number = '', content = '', tag: string[] = []) {
        const selection = parseObjectivePaper(paper);
        if (typeof pid !== 'string') pid = `P${pid}`;
        if (pid && await problem.get(domainId, pid)) throw new ProblemAlreadyExistError(pid);
        const sourceIds = selection.items.map((item) => item.id);
        const docs = await document.getMulti(domainId, document.TYPE_PROBLEM, {
            docId: { $in: sourceIds }, objectiveKind: { $in: ['single', 'multiple', 'judge'] }, reference: { $exists: false },
        }, ['docId', 'title', 'tag', 'objective', 'additional_file']).toArray();
        const sources = new Map(docs.map((doc) => [doc.docId, doc]));
        const files: { sourceId: number, oldName: string, newName: string }[] = [];
        const snapshot: ObjectivePaper = {
            version: 1,
            items: selection.items.map(({ id, score }, index) => {
                const source = sources.get(id);
                if (!source?.objective) throw new ValidationError('paper', null, '部分原题已不存在，请刷新题目列表后重新选择');
                const question = parseObjective(JSON.stringify(source.objective));
                const renamed = new Map<string, string>();
                const objective = rewriteObjectiveFiles(question, (filename) => {
                    if (!source.additional_file?.some((file) => file.name === filename)) {
                        throw new ValidationError('paper', null, `第 ${index + 1} 题缺少附件，请先编辑原题`);
                    }
                    if (!renamed.has(filename)) {
                        const newName = `q${index + 1}-${files.length + 1}-${sanitize(filename)}`;
                        renamed.set(filename, newName);
                        files.push({ sourceId: id, oldName: filename, newName });
                    }
                    return renamed.get(filename);
                });
                return { sourceId: id, score, objective, title: source.title, tags: [...source.tag] };
            }),
        };
        const built = buildObjectivePaper(snapshot, content);
        const explicitTags = tag.map((value) => value.trim()).filter(Boolean);
        const tags = explicitTags.length ? parseObjectiveTags(explicitTags)
            : [...new Set(snapshot.items.flatMap((item) => item.tags))].slice(0, 20);
        const docId = await problem.add(domainId, pid, title, built.content, this.user._id, tags, {
            hidden: true, objectivePaper: snapshot,
        });
        try {
            await problem.addTestdata(domainId, docId, 'config.yaml', Buffer.from(built.config), this.user._id);
            const copies = await Promise.allSettled(files.map(async ({ sourceId, oldName, newName }) => {
                await storage.copy(`problem/${domainId}/${sourceId}/additional_file/${oldName}`,
                    `problem/${domainId}/${docId}/additional_file/${newName}`);
                await problem.addAdditionalFile(domainId, docId, newName, '', this.user._id, true);
            }));
            const failed = copies.find((result) => result.status === 'rejected');
            if (failed?.status === 'rejected') throw failed.reason;
            // The configured paper becomes a normal catalog problem only after all copies succeed.
            await problem.edit(domainId, docId, { hidden: false, config: built.config });
        } catch (error) {
            await problem.del(domainId, docId);
            throw error;
        }
        this.response.body = { pid: pid || docId };
        this.response.redirect = isScratchDomain(this.domain)
            ? this.url('scratch_assignment_create', { query: { objectivePaperId: docId } })
            : this.url('problem_detail', { pid: pid || docId });
    }
}

export const ProblemApi = {
    problem: Query(
        Schema.object({
            id: Schema.union([Schema.number().step(1), Schema.string()]).required(),
            domainId: Schema.string().required(),
        }),
        async (ctx, args) => {
            if (isScratchDomain(await domain.get(args.domainId))) {
                const actor = await user.getById(args.domainId, ctx.user._id);
                if (!actor.hasPerm(PERM.PERM_EDIT_DOMAIN)) throw new PermissionError(PERM.PERM_EDIT_DOMAIN);
            }
            const pdoc = await problem.get(args.domainId, args.id);
            if (!pdoc) return null;
            if (problem.isObjectiveSource(pdoc)) {
                const actor = await user.getById(args.domainId, ctx.user._id);
                if (!problem.canViewBy(pdoc, actor)) throw new PermissionError(PERM.PERM_CREATE_PROBLEM);
            } else if (pdoc.hidden) ctx.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
            return pdoc;
        },
    ),
    problems: Query(
        Schema.object({
            ids: Schema.array(Schema.number().step(1)).required(),
            domainId: Schema.string().required(),
        }),
        async (ctx, args) => {
            if (isScratchDomain(await domain.get(args.domainId))) {
                const actor = await user.getById(args.domainId, ctx.user._id);
                if (!actor.hasPerm(PERM.PERM_EDIT_DOMAIN)) throw new PermissionError(PERM.PERM_EDIT_DOMAIN);
            }
            const pdocs = await problem.getList(args.domainId, args.ids, ctx.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || ctx.user._id,
                false, undefined, true);
            return args.ids.map((id) => pdocs[+id]).filter((i) => i);
        },
    ),
    problemFilterStudents: Query(
        Schema.object({
            auto: Schema.array(Schema.string()),
            search: Schema.string(),
            limit: Schema.number().step(1),
        }),
        async (ctx, args) => {
            ctx.checkPerm(PERM.PERM_EDIT_DOMAIN);
            const ddoc = ctx.domain;
            if (!ddoc) return [];
            const limit = Math.max(1, Math.min(args.limit || 10, 10));
            const scope = await prepareProblemFilterScope(ddoc, ctx.user._id);
            const candidateIds: number[] = [];
            if (args.auto?.length) {
                candidateIds.push(...args.auto.slice(0, limit)
                    .map((item) => +item)
                    .filter((uid) => Number.isSafeInteger(uid) && uid > 1));
            } else {
                const joinedUids = await domain.collUser.distinct('uid', {
                    domainId: { $in: scope.scopeDomainIds },
                    uid: { $gt: 1 },
                    join: true,
                });
                const searchableUids = joinedUids.filter((uid) => uid !== ctx.user._id
                    && !scope.memberUids.has(uid)
                    && !scope.excludedLegacyUids.has(uid));
                if (searchableUids.length) {
                    const search = args.search?.trim() || '';
                    const numericUid = +search;
                    const exact = search ? ((Number.isSafeInteger(numericUid)
                        ? await user.getById(ddoc._id, numericUid)
                        : null) || await user.getByUname(ddoc._id, search)) : null;
                    const usernamePrefix = new RegExp(`^${escapeRegExp(search.toLowerCase())}`);
                    const displayNamePrefix = new RegExp(`^${escapeRegExp(search)}`, 'i');
                    const candidateLimit = Math.max(limit * 5, 50);
                    let usernameOffset = 0;
                    let displayNameOffset = 0;
                    let usernameExhausted = false;
                    let displayNameExhausted = false;
                    const resolvedUids = new Set<number>();
                    if (exact && searchableUids.includes(exact._id)) {
                        try {
                            await resolveProblemFilterStudent(ddoc, ctx.user._id, exact._id, scope);
                            candidateIds.push(exact._id);
                        } catch (error) {
                            if (!(error instanceof UserNotFoundError)) throw error;
                        }
                        resolvedUids.add(exact._id);
                    }
                    while (candidateIds.length < limit && (!usernameExhausted || !displayNameExhausted)) {
                        // eslint-disable-next-line no-await-in-loop
                        const [usernameMatches, displayNameMatches] = await Promise.all([
                            usernameExhausted
                                ? Promise.resolve([])
                                : user.coll.find({
                                    _id: { $in: searchableUids },
                                    unameLower: { $regex: usernamePrefix },
                                }).sort({ _id: 1 }).skip(usernameOffset).limit(candidateLimit)
                                    .project<{ _id: number }>({ _id: 1 }).toArray(),
                            displayNameExhausted
                                ? Promise.resolve([])
                                : domain.collUser.find({
                                    domainId: { $in: scope.scopeDomainIds },
                                    uid: { $in: searchableUids },
                                    join: true,
                                    displayName: { $regex: displayNamePrefix },
                                }).sort({ uid: 1 }).skip(displayNameOffset).limit(candidateLimit)
                                    .project<{ uid: number }>({ uid: 1 }).toArray(),
                        ]);
                        usernameOffset += usernameMatches.length;
                        displayNameOffset += displayNameMatches.length;
                        usernameExhausted = usernameMatches.length < candidateLimit;
                        displayNameExhausted = displayNameMatches.length < candidateLimit;
                        const batchUids = Array.from(new Set([
                            ...usernameMatches.map((item) => item._id),
                            ...displayNameMatches.map((item) => item.uid),
                        ])).filter((uid) => !resolvedUids.has(uid));
                        for (const uid of batchUids) resolvedUids.add(uid);
                        // eslint-disable-next-line no-await-in-loop
                        const batch = await Promise.all(batchUids.map(async (uid) => {
                            try {
                                await resolveProblemFilterStudent(ddoc, ctx.user._id, uid, scope);
                                return uid;
                            } catch (error) {
                                if (!(error instanceof UserNotFoundError)) throw error;
                                return null;
                            }
                        }));
                        candidateIds.push(...batch.filter((uid): uid is number => uid !== null));
                    }
                }
            }
            const result = await Promise.all(Array.from(new Set(candidateIds)).map(async (uid) => {
                try {
                    // Keep autocomplete results under the exact same scope check used by the page request.
                    const target = await resolveProblemFilterStudent(ddoc, ctx.user._id, uid, scope);
                    target.avatarUrl = avatar(target.avatar);
                    return target;
                } catch (error) {
                    if (!(error instanceof UserNotFoundError)) throw error;
                    return null;
                }
            }));
            return result.filter((item): item is User => !!item).slice(0, limit);
        },
    ),
} as const;

declare module '@hydrooj/framework' {
    interface Apis {
        problem: typeof ProblemApi;
    }
}

export async function apply(ctx: Context) {
    ctx.Route('problem_main', '/p', ProblemMainHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_mistake', '/mistakes', ProblemMistakeHandler, PRIV.PRIV_USER_PROFILE, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_random', '/problem/random', ProblemRandomHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('online_ide', '/ide', OnlineIdeHandler, PERM.PERM_SUBMIT_PROBLEM);
    ctx.Route('problem_detail', '/p/:pid', ProblemDetailHandler);
    ctx.Route('problem_submit', '/p/:pid/submit', ProblemSubmitHandler);
    ctx.Route('problem_hack', '/p/:pid/hack/:rid', ProblemHackHandler, PERM.PERM_SUBMIT_PROBLEM);
    ctx.Route('problem_edit', '/p/:pid/edit', ProblemEditHandler);
    ctx.Route('problem_config', '/p/:pid/config', ProblemConfigHandler);
    ctx.Route('problem_files', '/p/:pid/files', ProblemFilesHandler);
    ctx.Route('problem_file_download', '/p/:pid/file/:filename', ProblemFileDownloadHandler);
    ctx.Route('problem_solution', '/p/:pid/solution', ProblemSolutionHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_solution_detail', '/p/:pid/solution/:sid', ProblemSolutionHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_solution_raw', '/p/:pid/solution/:psid/raw', ProblemSolutionRawHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_solution_reply_raw', '/p/:pid/solution/:psid/:psrid/raw', ProblemSolutionRawHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_statistics', '/p/:pid/stat', ProblemStatisticsHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_create', '/problem/create', ProblemCreateHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.Route('problem_create_objective', '/problem/create/objective', ProblemCreateObjectiveHandler);
    ctx.Route('problem_objective', '/problem/objective', ProblemObjectiveHandler);
    ctx.Route('problem_objective_items', '/problem/objective/items', ProblemObjectiveItemsHandler);
    await ctx.inject(['api'], ({ api }) => {
        api.provide(ProblemApi);
    });
}
