import { extname } from 'path';

const RASTER_TYPES: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
};

/** Only raster images may replace the existing inline attachment response. */
export function isInlineRasterImage(filename: string, meta: { 'Content-Type'?: string } | null) {
    const expected = RASTER_TYPES[extname(filename).toLowerCase()];
    return !!expected && expected === String(meta?.['Content-Type'] || '').split(';')[0].trim().toLowerCase();
}

/** Called after the ordinary download handler authorizes this exact attachment.
 * Keep a signed CDN redirect from tainting a learner's canvas during sharing. */
export async function serveSharedRaster(handler: any, filename: string, meta: { 'Content-Type'?: string; size?: number } | null,
    read: () => Promise<unknown>) {
    if (handler.request?.headers?.['x-hydro-media-cache'] !== 'share-raster-v1' || !isInlineRasterImage(filename, meta)
        || !Number.isSafeInteger(meta?.size) || meta.size <= 0 || meta.size > 10 * 1024 * 1024) return false;
    handler.response.body = await read();
    handler.response.type = meta['Content-Type'].split(';')[0].trim();
    handler.response.addHeader('Cache-Control', 'private, no-store');
    handler.response.addHeader('Vary', 'Cookie, Authorization, X-Hydro-Media-Cache');
    handler.response.addHeader('X-Content-Type-Options', 'nosniff');
    handler.response.addHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return true;
}
