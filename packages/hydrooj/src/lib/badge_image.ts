export type BadgeAcDisplaySize = 384 | 768;

type BadgeAcArtwork = { _id: number, acImagePath?: string, acImageUpdatedAt?: string };

/** Badge label artwork is deliberately independent of the full-screen AC effect. */
export function getBadgeIconUrl(domainId: string, badge: { _id: number, iconImagePath?: string, iconImageUpdatedAt?: string }) {
    if (!badge?.iconImagePath) return '';
    return `/d/${encodeURIComponent(domainId)}/badge/${badge._id}/icon-image`
        + `?v=${encodeURIComponent(badge.iconImageUpdatedAt || '')}`;
}

/**
 * Celebrations use the uploaded original, just like the teacher's AC preview.
 * The 520 CSS-pixel effect can need over 1100 source pixels on Retina screens;
 * thumbnail variants must never be enlarged into the live celebration.
 */
export function getBadgeAcCelebrationUrl(domainId: string, badge: BadgeAcArtwork) {
    if (!badge?.acImagePath) return '';
    return `/d/${encodeURIComponent(domainId)}/badge/${badge._id}/ac-image`
        + `?v=${encodeURIComponent(badge.acImageUpdatedAt || '')}`;
}

/** Small gallery/list thumbnails only; live AC playback uses the original. */
export function getBadgeAcDisplayUrl(
    domainId: string,
    badge: BadgeAcArtwork,
    size: BadgeAcDisplaySize = 384,
) {
    if (!badge?.acImagePath) return '';
    const displaySize = size === 768 ? 768 : 384;
    return `/d/${encodeURIComponent(domainId)}/badge/${badge._id}/ac-image`
        + `?size=${displaySize}&v=${encodeURIComponent(badge.acImageUpdatedAt || '')}`;
}
