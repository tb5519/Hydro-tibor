/** Generated background media are the only videos admitted to primary asset storage. */
const prefixPattern = '(?:domain/[^/]+/home-video|(?:domain/[^/]+/)?badge/[0-9]+/profile-video)';
const stampPattern = '[0-9]+-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
export const BACKGROUND_VIDEO_MAX_SIZE = 40 * 1024 * 1024;
export const BACKGROUND_POSTER_MAX_SIZE = 8 * 1024 * 1024;
const safe = (path: unknown): path is string => typeof path === 'string' && !/[\\\u0000-\u001f?#%]/.test(path)
    && path.split('/').every((part) => part && part !== '.' && part !== '..');
export function backgroundVideoMediaType(path: string) {
    if (!safe(path)) return '';
    if (new RegExp(`^${prefixPattern}-${stampPattern}\\.mp4$`).test(path)) return 'video/mp4';
    if (new RegExp(`^${prefixPattern}-${stampPattern}\\.webm$`).test(path)) return 'video/webm';
    if (new RegExp(`^${prefixPattern}-poster-${stampPattern}\\.jpg$`).test(path)) return 'image/jpeg';
    return '';
}
export function isBackgroundVideoPrefix(prefix: string) {
    return safe(prefix) && new RegExp(`^${prefixPattern}$`).test(prefix);
}
export function isBackgroundVideoPath(prefix: string, value: unknown, poster = false) {
    return isBackgroundVideoPrefix(prefix) && safe(value) && value.startsWith(`${prefix}${poster ? '-poster-' : '-'}`)
        && (poster ? backgroundVideoMediaType(value) === 'image/jpeg' : backgroundVideoMediaType(value).startsWith('video/'));
}
