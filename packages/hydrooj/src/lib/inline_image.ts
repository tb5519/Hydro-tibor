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
