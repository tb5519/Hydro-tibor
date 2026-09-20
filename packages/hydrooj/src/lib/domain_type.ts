export type DomainType = 'oj' | 'scratch';

export const DOMAIN_TYPES: DomainType[] = ['oj', 'scratch'];

/** Domains created before Scratch support retain their original OJ behavior. */
export function getDomainType(domain: { domainType?: unknown } | null | undefined): DomainType {
    return domain?.domainType === 'scratch' ? 'scratch' : 'oj';
}

export function isScratchDomain(domain: { domainType?: unknown } | null | undefined) {
    return getDomainType(domain) === 'scratch';
}

/** Keep the same eligibility rule in RP calculation and ranking reads. */
export function getOjDomainQuery() {
    return { domainType: { $ne: 'scratch' as const } };
}

/** Paths are relative to /d/:domainId after the domain middleware runs. */
export function isOjDomainPath(path: string) {
    return /^\/(?:p|problem|mistakes|ide|training|contest|homework|record|ranking|badge-honor-wall|discuss|judge)(?:\/|$)/i.test(path)
        || /^\/(?:record-conn|record-detail-conn|contest-submit-feedback|contest-submit-feedback-conn|objective-submit-feedback)(?:\/|$)/i.test(path)
        || /^\/domain\/(?:ranking-setting|navigation|home-poster)(?:\/|$)/i.test(path)
        || /^\/api\/(?:problem[^/]*|contest[^/]*|homework[^/]*|training[^/]*|record[^/]*|ranking[^/]*|rpc)(?:\/|$)/i.test(path);
}
