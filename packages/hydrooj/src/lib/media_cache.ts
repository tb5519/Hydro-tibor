import { createHash } from 'crypto';
import { extname } from 'path';
import { Readable } from 'stream';
import type { AssetSource } from './asset_delivery';

const YEAR = 'private, max-age=31536000, immutable';
const VARY = 'Cookie, Authorization, X-Hydro-Media-Cache';
const TYPES: Record<string, string[]> = {
    '.png': ['image/png'], '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.gif': ['image/gif'],
    '.webp': ['image/webp'], '.avif': ['image/avif'], '.bmp': ['image/bmp'], '.ico': ['image/x-icon', 'image/vnd.microsoft.icon'],
    '.mp3': ['audio/mpeg'], '.ogg': ['audio/ogg', 'video/ogg'], '.wav': ['audio/wav', 'audio/wave', 'audio/x-wav'],
    '.m4a': ['audio/mp4', 'audio/x-m4a'], '.aac': ['audio/aac'], '.flac': ['audio/flac'],
    '.mp4': ['video/mp4'], '.webm': ['audio/webm', 'video/webm'], '.mov': ['video/quicktime'], '.ogv': ['video/ogg'],
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function mediaCacheVersion(source: AssetSource) {
    const { path, meta, variant = '' } = source || {};
    const type = `${meta?.['Content-Type'] || ''}`.split(';')[0].trim().toLowerCase();
    if (typeof path !== 'string' || !path || path.startsWith('/') || /[\\\u0000-\u001f?#]/.test(path)
        || path.split('/').some((part) => !part || part === '.' || part === '..')
        || !TYPES[extname(path).toLowerCase()]?.includes(type)
        || !Number.isSafeInteger(meta?.size) || meta.size <= 0
        || typeof variant !== 'string' || variant.length > 200) return '';
    const remote = meta.remoteAsset;
    if (remote && (typeof remote.key !== 'string'
        || !/^media\/v1\/[a-f0-9]{64}\.[a-z0-9]+$/.test(remote.key)
        || !/^[a-f0-9]{64}$/.test(remote.sha256) || remote.size !== meta.size
        || remote.contentType !== meta['Content-Type'])) return '';
    const etag = typeof meta.etag === 'string' ? meta.etag : '';
    const modified = meta.lastModified ? new Date(meta.lastModified).getTime() : 0;
    if (!remote?.key && !etag && !(modified > 0)) return '';
    return hash(['media-cache-v1', path, remote?.bucket || '', remote?.key || '', remote?.sha256 || '',
        etag, Number.isFinite(modified) ? modified : 0, meta.size, type, variant]);
}

export function mediaCacheScope(handler: any) {
    const uid = handler.user?._id;
    return hash(Number.isSafeInteger(uid) && uid > 1
        ? ['media-cache-v1', uid, `${handler.session?._id || ''}`] : ['media-cache-v1', 'guest']);
}

export function isMediaCacheRequest(handler: any) {
    return handler.request?.method?.toLowerCase() === 'get'
        && handler.request.headers?.['x-hydro-media-cache'] === 'resolve-v1';
}

function privateResponse(handler: any) {
    handler.response.addHeader('Cache-Control', 'private, no-store');
    handler.response.addHeader('Vary', VARY);
    handler.response.addHeader('X-Content-Type-Options', 'nosniff');
}

function jsonResponse(handler: any, body: unknown, status = 200) {
    privateResponse(handler);
    handler.response.redirect = null;
    handler.response.template = null;
    handler.response.etag = null;
    handler.response.disposition = null;
    handler.response.status = status;
    // An explicit type also prevents framework context injection into descriptors.
    handler.response.type = 'application/json';
    handler.response.body = body;
}

/** Called only after the original business handler has authorized this object. */
export function respondMediaCache(handler: any, source: AssetSource, target?: string) {
    if (!isMediaCacheRequest(handler)) return false;
    const version = mediaCacheVersion(source);
    if (!version) return false;
    const scope = mediaCacheScope(handler);
    const disposition = source.contentDisposition || handler.response.disposition;
    const contentDisposition = typeof disposition === 'string' && disposition.length <= 300
        && /^(?:attachment|inline)(?:;[^\r\n]*)?$/.test(disposition) ? disposition : '';
    let url = target;
    if (!url) {
        const path = handler.request.originalPath || handler.request.path;
        if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false;
        const local = new URL(path, 'https://media-cache.invalid');
        if (local.origin !== 'https://media-cache.invalid') return false;
        local.search = handler.request.querystring || '';
        local.searchParams.set('__media_version', version);
        local.searchParams.set('__media_scope', scope);
        url = `${local.pathname}${local.search}`;
    }
    jsonResponse(handler, { mediaCache: {
        version, scope, type: source.meta['Content-Type'].split(';')[0].trim().toLowerCase(), size: source.meta.size, url,
        ...(contentDisposition ? { contentDisposition } : {}),
    } });
    return true;
}

/** Reject a replaced local object before its new bytes can fill an old cache key. */
export function validateMediaCacheRequest(handler: any, source: AssetSource) {
    const requested = handler.request?.query?.__media_version;
    if (requested === undefined) return false;
    privateResponse(handler);
    if (typeof requested === 'string' && /^[a-f0-9]{64}$/.test(requested) && requested === mediaCacheVersion(source)
        && handler.request.query.__media_scope === mediaCacheScope(handler)) return false;
    jsonResponse(handler, { error: 'Media version changed. Resolve the current resource again.' }, 409);
    return true;
}

function rangeFor(handler: any, size: number, etag: string) {
    const range = handler.request.headers?.range;
    const ifRange = handler.request.headers?.['if-range'];
    if (typeof range !== 'string' || (ifRange && ifRange !== etag)) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (!match[1] && !match[2])) return null;
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return false;
    return { start, end };
}

function sliceStream(source: Readable, start: number, end: number) {
    return Readable.from((async function* readRange() {
        let offset = 0;
        try {
            for await (const value of source) {
                const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
                const next = offset + chunk.length;
                if (next > start) yield chunk.subarray(Math.max(0, start - offset), Math.min(chunk.length, end + 1 - offset));
                offset = next;
                if (offset > end) return;
            }
            if (offset <= end) throw new Error('Media stream ended before the requested range');
        } finally {
            source.destroy();
        }
    }()));
}

/** Apply only after a successful read. Ordinary mutable URLs keep their existing policy. */
export function setMediaCacheHeaders(handler: any, source: AssetSource, options: { authorizedSignedSource?: boolean } = {}) {
    const version = mediaCacheVersion(source);
    // A validated local storage link already identifies an immutable physical object.
    const currentVersion = handler.request?.query?.__media_version === version
        && handler.request.query.__media_scope === mediaCacheScope(handler);
    if (!version || (!currentVersion && !options.authorizedSignedSource)
        || handler.response.redirect || handler.response.status >= 400 || !handler.response.body) return false;
    const etag = `"${version}"`;
    const size = source.meta.size;
    const range = rangeFor(handler, size, etag);
    if (range === false) {
        handler.response.body.destroy?.();
        handler.response.body = Buffer.alloc(0);
        handler.response.status = 416;
        handler.response.addHeader('Content-Range', `bytes */${size}`);
        handler.response.addHeader('Content-Length', '0');
        privateResponse(handler);
        return true;
    }
    const body = handler.response.body;
    if (range) {
        if (Buffer.isBuffer(body)) handler.response.body = body.subarray(range.start, range.end + 1);
        else if (typeof body.pipe === 'function') handler.response.body = sliceStream(body, range.start, range.end);
        else return false;
        handler.response.status = 206;
        handler.response.addHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    }
    handler.response.type = source.meta['Content-Type'];
    handler.response.addHeader('Cache-Control', YEAR);
    handler.response.addHeader('Vary', VARY);
    handler.response.addHeader('ETag', etag);
    handler.response.addHeader('Accept-Ranges', 'bytes');
    handler.response.addHeader('Content-Length', `${range ? range.end - range.start + 1 : size}`);
    handler.response.addHeader('X-Content-Type-Options', 'nosniff');
    return true;
}
