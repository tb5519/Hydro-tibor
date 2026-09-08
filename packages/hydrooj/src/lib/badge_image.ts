export type BadgeAcDisplaySize = 384 | 768;

/** Display variants share a versioned URL everywhere; the original remains untouched. */
export function getBadgeAcDisplayUrl(
    domainId: string,
    badge: { _id: number, acImagePath?: string, acImageUpdatedAt?: string },
    size: BadgeAcDisplaySize = 384,
) {
    if (!badge?.acImagePath) return '';
    const displaySize = size === 768 ? 768 : 384;
    return `/d/${encodeURIComponent(domainId)}/badge/${badge._id}/ac-image`
        + `?size=${displaySize}&v=${encodeURIComponent(badge.acImageUpdatedAt || '')}`;
}
