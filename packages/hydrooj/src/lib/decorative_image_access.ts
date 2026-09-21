/** Only the currently selected homepage poster is public, never a storage directory. */
export function isHomePosterImageRequest(path: string, method: string) {
    return ['GET', 'HEAD'].includes(method.toUpperCase()) && path === '/home/poster';
}

export function isPublicHomePosterPath(domainId: string, path: unknown): path is string {
    if (typeof path !== 'string' || !domainId || /[/\\\\\u0000-\u001f]/.test(domainId)) return false;
    const parts = path.split('/');
    return parts.length === 3 && parts[0] === 'domain' && parts[1] === domainId
        && /^home-poster-[\w-]+\.(png|jpe?g|gif|webp|avif)$/i.test(parts[2]);
}
