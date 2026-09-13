import type { ProblemDoc, User } from '../interface';
import { PERM, PRIV } from '../model/builtin';
import problem from '../model/problem';
import user from '../model/user';
import { parseObjectiveConfig } from './objective_feedback';

export type ObjectiveCorrectAnswers = Record<string, string | string[]>;

function scalarAnswer(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return String(value);
    return undefined;
}

function isScore(value: unknown) {
    return (typeof value === 'number' || (typeof value === 'string' && !!value.trim()))
        && Number.isFinite(Number(value));
}

/** Extract display values from the judge's standard-answer formats, never its scoring configuration. */
export function buildObjectiveCorrectAnswers(config: unknown): ObjectiveCorrectAnswers {
    const grading = parseObjectiveConfig(config)?.answers;
    const answers: ObjectiveCorrectAnswers = Object.create(null);
    if (!grading || typeof grading !== 'object' || Array.isArray(grading)) return answers;
    for (const [id, info] of Object.entries(grading)) {
        if (!/^\d+(?:-\d+)?$/.test(id)) continue;
        if (Array.isArray(info)) {
            if (info.length !== 2 || !isScore(info[1])) continue;
            if (Array.isArray(info[0])) {
                // Multi-select comparison is strict in the judge; only string options match form answers.
                if (info[0].length && info[0].every((value) => typeof value === 'string' && value.trim())) {
                    answers[id] = [...new Set<string>(info[0])];
                }
            } else {
                const answer = scalarAnswer(info[0]);
                if (answer !== undefined) answers[id] = answer;
            }
        } else if (info && typeof info === 'object') {
            // In the alternative-answer format the judge accepts every truthy score, including partial credit.
            const accepted = Object.entries(info).filter(([answer, score]) => answer.trim() && score && isScore(score))
                .map(([answer]) => answer);
            if (accepted.length) answers[id] = accepted.length === 1 ? accepted[0] : accepted;
        }
    }
    return answers;
}

export function canViewObjectiveCorrectAnswers(viewer: User) {
    return viewer._id > 0 && viewer.hasPriv(PRIV.PRIV_USER_PROFILE)
        && (viewer.hasPriv(PRIV.PRIV_EDIT_SYSTEM) || viewer.hasPerm(PERM.PERM_EDIT_DOMAIN));
}

/** Caller must first complete the normal problem, record and homework visibility checks. */
export async function loadObjectiveCorrectAnswers(
    viewer: User, domainId: string, pdoc: ProblemDoc,
): Promise<ObjectiveCorrectAnswers | undefined> {
    if (!canViewObjectiveCorrectAnswers(viewer) || pdoc.domainId !== domainId || !parseObjectiveConfig(pdoc.config)) return undefined;
    // Public parsed configs omit grading answers. Read only the authoritative raw configuration after authorization.
    const raw = await problem.get(domainId, pdoc.docId, ['domainId', 'docId', 'reference', 'config'], true);
    if (!raw) return undefined;
    let source: ProblemDoc | null = raw;
    if (raw.reference) {
        const { domainId: sourceDomainId, pid } = raw.reference;
        if (sourceDomainId !== domainId && !viewer.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) {
            const sourceViewer = await user.getById(sourceDomainId, viewer._id);
            if (!sourceViewer?.hasPerm(PERM.PERM_EDIT_DOMAIN)) return undefined;
        }
        source = await problem.get(sourceDomainId, pid, ['domainId', 'docId', 'reference', 'config'], true);
        // References to references are invalid; never follow a second, unchecked domain boundary.
        if (!source || source.reference) return undefined;
    }
    const answers = buildObjectiveCorrectAnswers(source.config);
    return Object.keys(answers).length ? answers : undefined;
}
