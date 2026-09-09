import { randomUUID } from 'crypto';
import { inflateSync } from 'zlib';
import { PNG } from 'pngjs';
import { ValidationError } from '../error';

export const DOMAIN_AVATAR_MAX_SIZE = 8 * 1024 * 1024;
const MAX_DIMENSION = 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const AVATAR_FILENAME = /^avatar-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.png$/;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});

function crc32(data: Buffer) {
    let crc = 0xFFFFFFFF;
    for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function validatePngStream(data: Buffer, width: number, height: number) {
    const depth = data[24];
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[data[25]];
    if (!channels || ![1, 2, 4, 8, 16].includes(depth) || data[26] || data[27] || data[28] > 1) throw new ValidationError('avatar');
    const compressed: Buffer[] = [];
    let offset = 8;
    let ended = false;
    let seenPixels = false;
    let pixelsEnded = false;
    let seenPalette = false;
    while (offset < data.length) {
        if (offset + 12 > data.length) throw new ValidationError('avatar');
        const length = data.readUInt32BE(offset);
        const end = offset + length + 12;
        if (end > data.length) throw new ValidationError('avatar');
        const type = data.subarray(offset + 4, offset + 8).toString();
        if (!/^[A-Za-z]{4}$/.test(type)) throw new ValidationError('avatar');
        if (crc32(data.subarray(offset + 4, end - 4)) !== data.readUInt32BE(end - 4)) throw new ValidationError('avatar');
        if (type === 'IHDR' && offset !== 8) throw new ValidationError('avatar');
        if (type === 'PLTE') {
            if (seenPixels || seenPalette || !length || length > 768 || length % 3) throw new ValidationError('avatar');
            seenPalette = true;
        }
        if (type === 'IDAT') {
            if (pixelsEnded || (data[25] === 3 && !seenPalette)) throw new ValidationError('avatar');
            seenPixels = true;
            compressed.push(data.subarray(offset + 8, end - 4));
        } else if (seenPixels) pixelsEnded = true;
        if (type === 'IEND') {
            if (length || end !== data.length || !seenPixels) throw new ValidationError('avatar');
            ended = true;
        }
        offset = end;
    }
    if (!ended || !compressed.some((chunk) => chunk.length)) throw new ValidationError('avatar');
    const passes = data[28]
        ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
        : [[0, 0, 1, 1]];
    const expectedLength = passes.reduce((total, [x, y, dx, dy]) => {
        const columns = Math.max(0, Math.ceil((width - x) / dx));
        const rows = Math.max(0, Math.ceil((height - y) / dy));
        return total + (columns && rows ? rows * (Math.ceil(columns * channels * depth / 8) + 1) : 0);
    }, 0);
    // pngjs 5 can accept a truncated stream on newer Node versions. Native zlib
    // verifies the complete stream and its exact scanline size before decoding.
    const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedLength });
    if (pixels.length !== expectedLength) throw new ValidationError('avatar');
}

export function normalizeDomainAvatar(data: Buffer): Buffer {
    if (!data.length || data.length > DOMAIN_AVATAR_MAX_SIZE || data.length < 33
        || !data.subarray(0, 8).equals(PNG_SIGNATURE) || data.readUInt32BE(8) !== 13
        || data.subarray(12, 16).toString() !== 'IHDR') throw new ValidationError('avatar');
    // Check dimensions before allocating the decoded pixel buffer.
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) throw new ValidationError('avatar');
    try {
        validatePngStream(data, width, height);
        const decoded = PNG.sync.read(data, { checkCRC: true });
        if (decoded.width !== width || decoded.height !== height || decoded.data.length !== width * height * 4) {
            throw new ValidationError('avatar');
        }
        return PNG.sync.write({ width: decoded.width, height: decoded.height, data: decoded.data });
    } catch {
        throw new ValidationError('avatar');
    }
}

export function domainAvatarPath(domainId: string, filename: string) {
    if (!AVATAR_FILENAME.test(filename)) throw new ValidationError('avatar');
    return `domain/${domainId}/${filename}`;
}

export function createDomainAvatarTarget(domainId: string) {
    const filename = `avatar-${randomUUID()}.png`;
    return {
        storagePath: domainAvatarPath(domainId, filename),
        avatarUrl: `/d/${encodeURIComponent(domainId)}/domain/avatar/${filename}`,
    };
}

export function isOwnedDomainAvatarPath(domainId: string, target: unknown) {
    const prefix = `domain/${domainId}/`;
    return typeof target === 'string' && target.startsWith(prefix) && AVATAR_FILENAME.test(target.slice(prefix.length));
}
