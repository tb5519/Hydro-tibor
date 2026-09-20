import { isScratchDomain } from './domain_type';

export type DomainRankingMode = 'single' | 'all';

/**
 * Ranking scope belongs to the domain that is currently being viewed. Domains
 * created before this setting was introduced keep Hydro's original, local
 * ranking until their administrator opts into the shared view.
 */
export function getDomainRankingMode(domain: { rankingMode?: unknown, domainType?: unknown } | null | undefined): DomainRankingMode {
    return !isScratchDomain(domain) && domain?.rankingMode === 'all' ? 'all' : 'single';
}
