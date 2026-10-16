import { ValidationError } from '../error';

export interface StudentSubmissionLanguagePolicy {
    version: 1;
    mode: 'unrestricted' | 'global' | 'per-domain';
    languages: string[];
    domains: { domainId: string, languages: string[] }[];
}

type LanguageCatalog = Record<string, { display?: string, disabled?: boolean, hidden?: boolean, remote?: string | boolean }>;

export function defaultStudentSubmissionLanguagePolicy(): StudentSubmissionLanguagePolicy {
    return { version: 1, mode: 'unrestricted', languages: [], domains: [] };
}

/** Only languages offered for local programming submissions can be assigned. */
export function listSubmissionLanguageOptions(langs: LanguageCatalog): { id: string, name: string }[] {
    return Object.entries(langs).filter(([id, lang]) => id !== '_' && lang && !lang.disabled && !lang.hidden && !lang.remote)
        .map(([id, lang]) => ({ id, name: lang.display || id }));
}

function invalid(message: string): never {
    throw new ValidationError('submissionLanguagePolicy', null, message);
}

function isObject(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseStudentSubmissionLanguagePolicy(
    input: unknown, allowedDomainIds: string[], langs: LanguageCatalog,
): StudentSubmissionLanguagePolicy {
    let value: unknown = input;
    if (typeof input === 'string') {
        if (input.length > 30000) invalid('提交语言设置过长');
        try { value = JSON.parse(input); } catch { invalid('提交语言设置格式错误'); }
    }
    if (!isObject(value) || value.version !== 1 || !['unrestricted', 'global', 'per-domain'].includes(value.mode)
        || !Array.isArray(value.languages) || !Array.isArray(value.domains)
        || Object.keys(value).some((key) => !['version', 'mode', 'languages', 'domains'].includes(key))) {
        invalid('提交语言设置格式错误');
    }
    const allowedLanguages = new Set(listSubmissionLanguageOptions(langs).map((item) => item.id));
    const parseLanguages = (languages: unknown, required: boolean) => {
        if (!Array.isArray(languages) || (required && !languages.length)
            || languages.some((id) => typeof id !== 'string' || !allowedLanguages.has(id))
            || new Set(languages).size !== languages.length) invalid('请选择可用的编程语言，且不能重复');
        return [...languages] as string[];
    };
    const languages = parseLanguages(value.languages, value.mode === 'global');
    const domainsAllowed = new Set(allowedDomainIds);
    const seenDomains = new Set<string>();
    const domains = value.domains.map((item: unknown) => {
        if (!isObject(item) || typeof item.domainId !== 'string' || !domainsAllowed.has(item.domainId)
            || seenDomains.has(item.domainId) || Object.keys(item).some((key) => !['domainId', 'languages'].includes(key))) {
            invalid('请选择学员已加入的域，且不能重复');
        }
        seenDomains.add(item.domainId);
        return { domainId: item.domainId, languages: parseLanguages(item.languages, true) };
    });
    if ((value.mode === 'unrestricted' && (languages.length || domains.length))
        || (value.mode === 'global' && domains.length)
        || (value.mode === 'per-domain' && languages.length)) invalid('提交语言的范围与设置不一致');
    return { version: 1, mode: value.mode, languages, domains };
}

/** Read account policy directly, so membership fields cannot shadow teacher settings. */
export function getStudentSubmissionLanguages(userOrDoc: unknown, domainId: string): string[] | null {
    if (!isObject(userOrDoc)) return null;
    const doc = isObject(userOrDoc._udoc) ? userOrDoc._udoc : userOrDoc;
    const policy = doc.submissionLanguagePolicy;
    if (policy === undefined) return null;
    // A malformed restriction must not silently grant all languages.
    if (!isObject(policy) || policy.version !== 1) return [];
    if (policy.mode === 'unrestricted') return null;
    const copyLanguages = (languages: unknown): string[] => Array.isArray(languages)
        && languages.length > 0 && languages.every((id) => typeof id === 'string' && id.length > 0)
        ? [...new Set<string>(languages)] : [];
    if (policy.mode === 'global') return copyLanguages(policy.languages);
    if (policy.mode !== 'per-domain' || !Array.isArray(policy.domains)
        || policy.domains.some((item) => !isObject(item) || typeof item.domainId !== 'string')) return [];
    const matches = policy.domains.filter((item) => item.domainId.toLowerCase() === domainId.toLowerCase());
    if (matches.length > 1) return [];
    return matches.length ? copyLanguages(matches[0].languages) : null;
}
