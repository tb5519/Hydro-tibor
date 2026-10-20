import { inflateSync } from 'zlib';
import { PNG } from 'pngjs';

export const BADGE_ICON_IMAGE_LIMIT = 2 * 1024 * 1024;
export const BADGE_ICON_IMAGE_EXTS = ['.png', '.webp', '.jpg', '.jpeg', '.gif'];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const invalid = () => new Error('Invalid badge icon image');

function dimensions(width: number, height: number) {
    if (!width || !height || width > 4096 || height > 4096 || width * height > 4 * 1024 * 1024) throw invalid();
    return { width, height };
}

function pngDimensions(data: Buffer) {
    if (data.length < 45 || !data.subarray(0, 8).equals(PNG_SIGNATURE)
        || data.readUInt32BE(8) !== 13 || data.subarray(12, 16).toString() !== 'IHDR') throw invalid();
    const { width, height } = dimensions(data.readUInt32BE(16), data.readUInt32BE(20));
    const depth = data[24];
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[data[25]];
    if (!channels || ![1, 2, 4, 8, 16].includes(depth) || data[26] || data[27] || data[28] > 1) throw invalid();
    const compressed: Buffer[] = [];
    let ended = false;
    for (let offset = 8; offset < data.length;) {
        if (offset + 12 > data.length) throw invalid();
        const length = data.readUInt32BE(offset);
        const end = offset + length + 12;
        if (end > data.length) throw invalid();
        const type = data.subarray(offset + 4, offset + 8).toString();
        if (type === 'IDAT') compressed.push(data.subarray(offset + 8, end - 4));
        if (type === 'IEND') {
            if (length || end !== data.length) throw invalid();
            ended = true;
        }
        offset = end;
    }
    if (!ended || !compressed.length) throw invalid();
    const passes = data[28]
        ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
        : [[0, 0, 1, 1]];
    const expectedLength = passes.reduce((total, [x, y, dx, dy]) => {
        const columns = Math.max(0, Math.ceil((width - x) / dx));
        const rows = Math.max(0, Math.ceil((height - y) / dy));
        return total + (columns && rows ? rows * (Math.ceil(columns * channels * depth / 8) + 1) : 0);
    }, 0);
    if (inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedLength }).length !== expectedLength) throw invalid();
    const decoded = PNG.sync.read(data, { checkCRC: true });
    if (decoded.width !== width || decoded.height !== height) throw invalid();
    return { width, height };
}

/** Validate the real raster format and dimensions before any upload or metadata mutation. */
export function validateBadgeIconImage(data: Buffer, ext: string) {
    if (!data.length || data.length > BADGE_ICON_IMAGE_LIMIT || !BADGE_ICON_IMAGE_EXTS.includes(ext)) throw invalid();
    try {
        if (ext === '.png') return { ...pngDimensions(data), contentType: 'image/png' };
        if (ext === '.gif') {
            if (data.length < 14 || !['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString()) || data.at(-1) !== 0x3B) throw invalid();
            return { ...dimensions(data.readUInt16LE(6), data.readUInt16LE(8)), contentType: 'image/gif' };
        }
        if (ext === '.webp') {
            if (data.length < 30 || data.subarray(0, 4).toString() !== 'RIFF' || data.subarray(8, 12).toString() !== 'WEBP'
                || data.readUInt32LE(4) + 8 !== data.length) throw invalid();
            const format = data.subarray(12, 16).toString();
            let size: { width: number, height: number };
            if (format === 'VP8X' && data.readUInt32LE(16) === 10) {
                size = dimensions(data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1);
            } else if (format === 'VP8 ' && data.subarray(23, 26).equals(Buffer.from([0x9D, 0x01, 0x2A]))) {
                size = dimensions(data.readUInt16LE(26) & 0x3FFF, data.readUInt16LE(28) & 0x3FFF);
            } else if (format === 'VP8L' && data[20] === 0x2F) {
                const bits = data.readUInt32LE(21);
                size = dimensions((bits & 0x3FFF) + 1, ((bits >>> 14) & 0x3FFF) + 1);
            } else throw invalid();
            return { ...size, contentType: 'image/webp' };
        }
        if (data.length < 12 || data[0] !== 0xFF || data[1] !== 0xD8 || data.at(-2) !== 0xFF || data.at(-1) !== 0xD9) throw invalid();
        for (let offset = 2; offset + 4 <= data.length;) {
            if (data[offset] !== 0xFF) throw invalid();
            while (data[offset] === 0xFF) offset++;
            const marker = data[offset++];
            if (marker === 0xDA || marker === 0xD9) break;
            if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
            const length = data.readUInt16BE(offset);
            if (length < 2 || offset + length > data.length) throw invalid();
            if ([0xC0, 0xC1, 0xC2].includes(marker) && length >= 8) {
                return { ...dimensions(data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3)), contentType: 'image/jpeg' };
            }
            offset += length;
        }
    } catch { throw invalid(); }
    throw invalid();
}
