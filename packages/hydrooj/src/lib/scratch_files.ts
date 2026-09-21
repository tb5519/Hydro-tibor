/* eslint-disable no-await-in-loop */
import { createReadStream } from 'fs';
import { open, readFile } from 'fs/promises';
import { extname } from 'path';
import { Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import { createInflateRaw, inflate } from 'zlib';
import { PNG } from 'pngjs';
import { ValidationError } from '../error';

export const SCRATCH_MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PROJECT_JSON = 4 * 1024 * 1024;
const MAX_UNPACKED_SIZE = 100 * 1024 * 1024;
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
});
const BUILTIN_EXTENSIONS = new Set([
    'pen', 'music', 'makeymakey',
]);

export function validateScratchProject(project: any) {
    if (!project || !Array.isArray(project.targets) || !project.targets.length || project.targets.length > 1000
        || !project.targets.some((target) => target?.isStage === true)) {
        throw new ValidationError('file', null, '作品缺少有效的 Scratch 舞台。');
    }
    if (project.extensions !== undefined && (!Array.isArray(project.extensions)
        || project.extensions.some((extension) => !BUILTIN_EXTENSIONS.has(extension)))) {
        throw new ValidationError('file', null, '暂不支持自定义扩展，请移除后再保存。');
    }
    // The local editor must never load arbitrary executable extension URLs from a project.
    const pending = [project];
    let nodes = 0;
    while (pending.length) {
        const value = pending.pop();
        if (!value || typeof value !== 'object') continue;
        if (++nodes > 200000) throw new ValidationError('file', null, '作品结构过于复杂。');
        for (const [key, child] of Object.entries(value)) {
            if (/^(?:extensionurls|customextensions|extensionurl|extensioncode)$/i.test(key)
                && child && (typeof child !== 'object' || Object.keys(child).length)) {
                throw new ValidationError('file', null, '作品包含不允许加载的自定义扩展。');
            }
            if (child && typeof child === 'object') pending.push(child);
        }
    }
}

// Stream each ZIP entry through an asynchronous bounded inflater. The directory's
// advertised sizes alone cannot protect against forged ZIP expansion bombs. Only
// project.json is collected in memory; media bytes are counted and discarded.
export async function validateScratchArchive(filepath: string, sprite = false) {
    const description = sprite ? 'sprite.json' : 'project.json';
    const file = await open(filepath, 'r');
    try {
        const { size } = await file.stat();
        if (size > SCRATCH_MAX_FILE_SIZE || size < 22) throw new ValidationError('file', null, '作品须为 20 MB 以内的 .sb3 文件。');
        const read = async (position: number, length: number) => {
            if (position < 0 || length < 0 || position + length > size) throw new ValidationError('file', null, '作品压缩包损坏。');
            const buffer = Buffer.alloc(length);
            const { bytesRead } = await file.read(buffer, 0, length, position);
            if (bytesRead !== length) throw new ValidationError('file');
            return buffer;
        };
        const tail = await read(Math.max(0, size - 65557), Math.min(size, 65557));
        let end = tail.length - 22;
        for (; end >= 0; end--) {
            if (tail.readUInt32LE(end) === 0x06054B50 && end + 22 + tail.readUInt16LE(end + 20) === tail.length) break;
        }
        if (end < 0) throw new ValidationError('file', null, '请上传有效的 Scratch 3 作品。');
        const entries = tail.readUInt16LE(end + 10);
        const directorySize = tail.readUInt32LE(end + 12);
        const directoryOffset = tail.readUInt32LE(end + 16);
        if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)
            || entries !== tail.readUInt16LE(end + 8) || entries < 1 || entries > 3000
            || directorySize > 1024 * 1024 || directoryOffset + directorySize > size - tail.length + end) {
            throw new ValidationError('file', null, '作品文件数量或结构超出限制。');
        }
        const directory = await read(directoryOffset, directorySize);
        let offset = 0;
        let unpacked = 0;
        const archiveEntries: { name: string, offset: number, compressed: number, size: number, method: number, flags: number, crc: number }[] = [];
        const names = new Set<string>();
        for (let index = 0; index < entries; index++) {
            if (offset + 46 > directory.length || directory.readUInt32LE(offset) !== 0x02014B50) throw new ValidationError('file');
            const flags = directory.readUInt16LE(offset + 8);
            const method = directory.readUInt16LE(offset + 10);
            const compressed = directory.readUInt32LE(offset + 20);
            const entrySize = directory.readUInt32LE(offset + 24);
            const nameSize = directory.readUInt16LE(offset + 28);
            const extraSize = directory.readUInt16LE(offset + 30);
            const commentSize = directory.readUInt16LE(offset + 32);
            const localOffset = directory.readUInt32LE(offset + 42);
            const next = offset + 46 + nameSize + extraSize + commentSize;
            if (next > directory.length) throw new ValidationError('file');
            const name = directory.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
            unpacked += entrySize;
            if ((flags & 1) || ![0, 8].includes(method) || name.includes('\\') || name.startsWith('/')
                || name.split('/').includes('..') || name.includes('\0') || names.has(name)
                || unpacked > MAX_UNPACKED_SIZE || compressed > size || localOffset + 30 > directoryOffset) {
                throw new ValidationError('file', null, '作品压缩包包含不支持的内容。');
            }
            names.add(name);
            archiveEntries.push({ name, offset: localOffset, compressed, size: entrySize, method, flags, crc: directory.readUInt32LE(offset + 16) });
            offset = next;
        }
        if (sprite && (unpacked > SCRATCH_MAX_FILE_SIZE || archiveEntries.some((entry) => entry.name !== description
            && !/^[a-f0-9]{32}\.(?:svg|png|jpe?g|wav|mp3)$/.test(entry.name)))) {
            throw new ValidationError('file', null, '角色包只能包含角色描述及图片、声音，总解压大小不能超过 20 MB。');
        }
        const projectEntry = archiveEntries.find((entry) => entry.name === description);
        if (!projectEntry || projectEntry.size > MAX_PROJECT_JSON || projectEntry.compressed > MAX_PROJECT_JSON) {
            throw new ValidationError('file', null, `文件缺少 ${description}，或描述超过 4 MB。`);
        }
        let projectContent: Buffer;
        const media = new Map<string, Buffer>();
        for (const entry of archiveEntries) {
            const local = await read(entry.offset, 30);
            if (local.readUInt32LE(0) !== 0x04034B50 || local.readUInt16LE(8) !== entry.method
                || local.readUInt16LE(6) !== entry.flags) throw new ValidationError('file');
            const nameSize = local.readUInt16LE(26);
            const dataStart = entry.offset + 30 + nameSize + local.readUInt16LE(28);
            if ((await read(entry.offset + 30, nameSize)).toString('utf8') !== entry.name
                || dataStart + entry.compressed > directoryOffset) throw new ValidationError('file');
            let actualSize = 0;
            let crc = 0xffffffff;
            const parts: Buffer[] = [];
            const sink = new Writable({
                write(chunk: Buffer, encoding, callback) {
                    actualSize += chunk.length;
                    if (sprite) for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
                    if (actualSize > entry.size) {
                        callback(new ValidationError('file', null, '作品文件解压大小与声明不一致。'));
                        return;
                    }
                    if (entry.name === description || sprite) parts.push(chunk);
                    callback();
                },
            });
            try {
                if (entry.compressed) {
                    const input = createReadStream(filepath, { start: dataStart, end: dataStart + entry.compressed - 1 });
                    if (entry.method === 8) await pipeline(input, createInflateRaw({ chunkSize: 64 * 1024 }), sink);
                    else await pipeline(input, sink);
                }
                if (actualSize !== entry.size || (sprite && ((crc ^ 0xffffffff) >>> 0) !== entry.crc)) {
                    throw new ValidationError('file', null, '作品文件解压大小或校验和与声明不一致。');
                }
            } catch (error) {
                if (error instanceof ValidationError) throw error;
                throw new ValidationError('file', null, '作品压缩包损坏，无法读取。');
            }
            if (entry.name === description) projectContent = Buffer.concat(parts);
            else if (sprite) media.set(entry.name, Buffer.concat(parts));
        }
        try {
            const data = JSON.parse(projectContent.toString('utf8'));
            if (sprite) validateScratchSprite(data, media);
            else validateScratchProject(data);
        } catch (error) {
            if (error instanceof ValidationError) throw error;
            throw new ValidationError('file', null, `无法读取 ${description}。`);
        }
        return size;
    } finally {
        await file.close();
    }
}

const MATERIAL_TYPES: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.sb3': 'application/x.scratch.sb3',
};

export async function validateScratchMaterial(filepath: string, filename: string) {
    const extension = extname(filename).toLowerCase();
    const mime = MATERIAL_TYPES[extension];
    if (!mime) throw new ValidationError('file', null, '支持图片 PNG/JPG/GIF/WebP、音频 WAV/MP3/OGG、PDF、TXT 和 SB3。');
    if (extension === '.sb3') return { size: await validateScratchArchive(filepath), mime, extension };
    const file = await open(filepath, 'r');
    try {
        const { size } = await file.stat();
        if (!size || size > SCRATCH_MAX_FILE_SIZE) throw new ValidationError('file', null, '素材不能超过 20 MB。');
        const head = Buffer.alloc(16);
        await file.read(head, 0, head.length, 0);
        const valid = extension === '.txt'
            || (extension === '.png' && head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
            || (['.jpg', '.jpeg'].includes(extension) && head[0] === 255 && head[1] === 216 && head[2] === 255)
            || (extension === '.gif' && /^GIF8[79]a/.test(head.toString('ascii')))
            || (extension === '.webp' && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP')
            || (extension === '.wav' && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE')
            || (extension === '.mp3' && (head.toString('ascii', 0, 3) === 'ID3' || (head[0] === 255 && (head[1] & 224) === 224)))
            || (extension === '.ogg' && head.toString('ascii', 0, 4) === 'OggS')
            || (extension === '.pdf' && head.toString('ascii', 0, 5) === '%PDF-');
        if (!valid) throw new ValidationError('file', null, '素材内容与扩展名不一致。');
        return { size, mime, extension };
    } finally {
        await file.close();
    }
}

export async function validateScratchThumbnail(dataUrl: unknown): Promise<Buffer | null> {
    if (dataUrl === undefined || dataUrl === null || dataUrl === '') return null;
    if (typeof dataUrl !== 'string' || dataUrl.length > 2800000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
        throw new ValidationError('thumbnail', null, '封面必须为 2 MB 以内的 PNG 图片。');
    }
    const buffer = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
    if (buffer.length < 33 || buffer.length > 2 * 1024 * 1024
        || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        || buffer.toString('ascii', 12, 16) !== 'IHDR'
        || !buffer.readUInt32BE(16) || buffer.readUInt32BE(16) > 1024
        || !buffer.readUInt32BE(20) || buffer.readUInt32BE(20) > 1024
        || buffer[24] !== 8 || ![2, 6].includes(buffer[25]) || buffer[28] !== 0) throw new ValidationError('thumbnail');
    const chunks: Buffer[] = [];
    for (let offset = 8; offset < buffer.length;) {
        if (offset + 12 > buffer.length) throw new ValidationError('thumbnail');
        const length = buffer.readUInt32BE(offset);
        if (offset + length + 12 > buffer.length) throw new ValidationError('thumbnail');
        const kind = buffer.toString('ascii', offset + 4, offset + 8);
        if (kind === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
        if (['acTL', 'fcTL', 'fdAT'].includes(kind) || (kind === 'IHDR' && offset !== 8)) throw new ValidationError('thumbnail');
        offset += length + 12;
    }
    const expectedSize = (buffer.readUInt32BE(16) * (buffer[25] === 6 ? 4 : 3) + 1) * buffer.readUInt32BE(20);
    try {
        const raw = await promisify(inflate)(Buffer.concat(chunks), { maxOutputLength: expectedSize });
        if (raw.length !== expectedSize) throw new Error('Invalid decoded PNG length');
    } catch {
        throw new ValidationError('thumbnail', null, '封面 PNG 图片损坏或解压超出限制。');
    }
    await new Promise<void>((resolve, reject) => {
        new PNG({ checkCRC: true }).parse(buffer, (error) => {
            if (error) reject(new ValidationError('thumbnail', null, '封面 PNG 图片损坏。'));
            else resolve();
        });
    });
    return buffer;
}

export const SCRATCH_PRESET_KINDS = ['sprite', 'costume', 'sound', 'backdrop'] as const;
export type ScratchPresetKind = typeof SCRATCH_PRESET_KINDS[number];
// Standalone WebP is converted by the editor; sprite3 import accepts only
// Scratch's native costume formats inside the archive.
const SPRITE_IMAGES = new Set(['.png', '.jpg', '.jpeg', '.svg']);
const PRESET_IMAGES = new Set([...SPRITE_IMAGES, '.webp']);
const SVG_TAGS = new Set('svg g defs use image path rect circle ellipse line polyline polygon linearGradient radialGradient stop clipPath mask text tspan title desc'.split(' '));
const SVG_ATTRIBUTES = new Set(('id class xmlns xmlns:xlink version viewBox width height x y x1 y1 x2 y2 dx dy cx cy r rx ry d points '
    + 'transform fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray '
    + 'stroke-dashoffset stroke-opacity opacity clip-path clip-rule mask gradientUnits gradientTransform spreadMethod offset '
    + 'stop-color stop-opacity fx fy fr href xlink:href preserveAspectRatio font-family font-size font-weight font-style '
    + 'text-anchor dominant-baseline letter-spacing word-spacing visibility display style xml:space data-paper-data enable-background clipPathUnits image-rendering overflow').split(' '));
const SVG_STYLES = new Set(('fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit '
    + 'stroke-dasharray stroke-dashoffset stroke-opacity opacity clip-path clip-rule mask stop-color stop-opacity '
    + 'font-family font-size font-weight font-style text-anchor dominant-baseline letter-spacing word-spacing visibility display mix-blend-mode enable-background image-rendering overflow').split(' '));

// Deliberately accept a small, well-formed SVG drawing language, rather than
// attempting to strip active content from arbitrary XML/CSS. No DTDs, foreign
// namespaces, scripts, animations, stylesheet blocks, or external resource URLs.
// Local shape references and bounded embedded PNGs cover ordinary Scratch exports.
export function validateScratchSvg(buffer: Buffer) {
    const invalid = () => { throw new ValidationError('file', null, 'SVG 包含不支持的脚本、外链或结构，请导出为普通 SVG 或 PNG。'); };
    if (!buffer.length || buffer.length > 2 * 1024 * 1024) {
        throw new ValidationError('file', null, 'SVG 须在 2 MB 以内，请简化图形或导出为 PNG。');
    }
    let xml = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (xml.includes('\uFFFD') || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(xml)) invalid();
    xml = xml.replace(/^\s*<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>/i, '');
    const decode = (value: string) => value.replace(/&([^;]*);|&/g, (entity, name) => {
        if (!name) return invalid();
        const basic = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
        if (Object.hasOwn(basic, name)) return basic[name];
        if (!/^#(?:[0-9]+|x[a-f0-9]+)$/i.test(name)) return invalid();
        const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        if (!Number.isSafeInteger(code) || (code < 32 && ![9, 10, 13].includes(code)) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return invalid();
        return String.fromCodePoint(code);
    });
    const safeValue = (value: string) => {
        if (/[\\<>@]/.test(value) || /(?:javascript|data|https?|file|ftp)\s*:|\/\//i.test(value)) invalid();
        // A local paint/clip reference is the only permitted CSS URL syntax.
        const withoutLocal = value.replace(/url\(\s*#[A-Za-z_][\w.,:-]*\s*\)/g, '');
        if (/url\s*\(|expression|\/\*|\*\//i.test(withoutLocal)) invalid();
    };
    const validPaperPath = (value: any) => {
        if (!Array.isArray(value) || value.length !== 2 || value[0] !== 'Path'
            || !value[1] || typeof value[1] !== 'object' || Array.isArray(value[1])) return false;
        for (const [key, item] of Object.entries(value[1])) {
            if (['applyMatrix', 'closed'].includes(key)) { if (typeof item !== 'boolean') return false; }
            else if (key === 'strokeWidth') { if (item !== null && !Number.isFinite(item)) return false; }
            else if (key === 'strokeCap') { if (item !== null && !['butt', 'round', 'square'].includes(item as string)) return false; }
            else if (key === 'segments') {
                if (!Array.isArray(item)) return false;
                const pending = [...item];
                let count = 0;
                while (pending.length) {
                    const child = pending.pop();
                    if (++count > 10000) return false;
                    if (Array.isArray(child)) pending.push(...child);
                    else if (!Number.isFinite(child)) return false;
                }
            } else return false;
        }
        return true;
    };
    const stack: string[] = [];
    const ids = new Map<string, string>();
    const uses: string[] = [];
    const shapeTags = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
    let rootSeen = false;
    let doctypeSeen = false;
    let nodes = 0;
    let position = 0;
    while (position < xml.length) {
        // This exact legacy Adobe header is declaration-only: no internal
        // subset or entity declarations are accepted or resolved by this parser.
        const legacyDoctype = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">';
        if (!rootSeen && !doctypeSeen && xml.startsWith(legacyDoctype, position)) {
            doctypeSeen = true;
            position += legacyDoctype.length;
            continue;
        }
        if (xml.startsWith('<!--', position)) {
            const end = xml.indexOf('-->', position + 4);
            if (end < 0 || xml.slice(position + 4, end).includes('--')) invalid();
            position = end + 3;
            continue;
        }
        if (xml[position] !== '<') {
            const next = xml.indexOf('<', position);
            const value = xml.slice(position, next < 0 ? xml.length : next);
            if ((!stack.length && value.trim()) || value.includes(']]>')) invalid();
            decode(value);
            position = next < 0 ? xml.length : next;
            continue;
        }
        const close = /^<\/([A-Za-z][\w-]*)\s*>/.exec(xml.slice(position));
        if (close) {
            if (stack.pop() !== close[1]) invalid();
            position += close[0].length;
            continue;
        }
        const start = /^<([A-Za-z][\w-]*)\b/.exec(xml.slice(position));
        if (!start || !SVG_TAGS.has(start[1]) || ++nodes > 10000 || stack.length >= 64) invalid();
        const tag = start[1];
        if ((shapeTags.has(stack[stack.length - 1]) || ['use', 'image'].includes(stack[stack.length - 1]))
            && !['title', 'desc'].includes(tag)) invalid();
        if (!stack.length) {
            if (rootSeen || tag !== 'svg') invalid();
            rootSeen = true;
        } else if (tag === 'svg') invalid();
        position += start[0].length;
        const seen = new Set<string>();
        let selfClosing = false;
        while (true) {
            const ending = /^\s*(\/?)>/.exec(xml.slice(position));
            if (ending) {
                selfClosing = !!ending[1];
                position += ending[0].length;
                break;
            }
            const attribute = /^\s+([A-Za-z][\w:.-]*)\s*=\s*("[^"<]*"|'[^'<]*')/.exec(xml.slice(position));
            if (!attribute || !SVG_ATTRIBUTES.has(attribute[1]) || seen.has(attribute[1])) invalid();
            const name = attribute[1];
            seen.add(name);
            const value = decode(attribute[2].slice(1, -1));
            if (name === 'id' && !ids.has(value)) ids.set(value, tag);
            if (name === 'xmlns' || name === 'xmlns:xlink') {
                if (tag !== 'svg' || value !== (name === 'xmlns' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xlink')) invalid();
            } else if (name === 'xml:space') {
                if (!['preserve', 'default'].includes(value)) invalid();
            } else if (name === 'data-paper-data') {
                // Scratch's vector editor exports these inert Paper.js hints.
                // Do not admit arbitrary serialized classes or nested metadata.
                if (value.length > 1024) invalid();
                let data;
                try { data = JSON.parse(value); } catch { invalid(); }
                if (!data || Array.isArray(data) || typeof data !== 'object') invalid();
                for (const [key, item] of Object.entries(data)) {
                    if (['isPaintingLayer', 'noHover'].includes(key) ? typeof item !== 'boolean'
                        : key === 'index' ? item !== null && !Number.isSafeInteger(item)
                            : key === 'origPos' ? item !== null : key === 'origRot' ? !Number.isFinite(item)
                                : key === 'origItem' ? !validPaperPath(item) : true) invalid();
                }
            } else if (name === 'href' || name === 'xlink:href') {
                if (tag === 'image') {
                    const embedded = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
                    if (!embedded) invalid();
                    validatePresetBytes(Buffer.from(embedded[1], 'base64'), '.png');
                } else {
                    if (!/^#[A-Za-z_][\w.,:-]*$/.test(value) || !['linearGradient', 'radialGradient', 'use'].includes(tag)) invalid();
                    if (tag === 'use') uses.push(value.slice(1));
                }
            } else if (name === 'style') {
                for (const declaration of value.split(';').filter((item) => item.trim())) {
                    const part = /^\s*([a-z-]+)\s*:\s*(.+)\s*$/.exec(declaration);
                    if (!part || !SVG_STYLES.has(part[1])) invalid();
                    if (part[1] === 'image-rendering'
                        && !/^(?:auto|optimizespeed|optimizequality|crisp-edges|pixelated)$/.test(part[2].trim().toLowerCase())) invalid();
                    if (part[1] === 'mix-blend-mode'
                        && !/^(?:normal|multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion|hue|saturation|color|luminosity)$/.test(part[2].trim())) invalid();
                    safeValue(part[2]);
                }
            } else safeValue(value);
            position += attribute[0].length;
        }
        if (!selfClosing) stack.push(tag);
    }
    if (!rootSeen || stack.length || uses.length > 1000 || uses.some((id) => !shapeTags.has(ids.get(id)))) invalid();
}

function validatePresetBytes(buffer: Buffer, extension: string) {
    if (extension === '.svg') return validateScratchSvg(buffer);
    const head = buffer.subarray(0, 16);
    const valid = (extension === '.png' && buffer.length >= 33
        && head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        && buffer.toString('ascii', 12, 16) === 'IHDR' && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0
        && buffer.readUInt32BE(16) * buffer.readUInt32BE(20) <= 16 * 1024 * 1024)
        || (['.jpg', '.jpeg'].includes(extension) && head[0] === 255 && head[1] === 216 && head[2] === 255)
        || (extension === '.webp' && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP')
        || (extension === '.wav' && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE')
        || (extension === '.mp3' && (head.toString('ascii', 0, 3) === 'ID3' || (head[0] === 255 && (head[1] & 224) === 224)));
    if (!valid) throw new ValidationError('file', null, '素材内容与扩展名不一致，或图片尺寸过大。');
}

function validateScratchSprite(sprite: any, media: Map<string, Buffer>) {
    if (!sprite || sprite.isStage !== false || typeof sprite.name !== 'string' || !sprite.name.trim()
        || !Array.isArray(sprite.costumes) || !sprite.costumes.length || sprite.costumes.length > 256
        || !Array.isArray(sprite.sounds) || sprite.sounds.length > 256 || !sprite.blocks || Array.isArray(sprite.blocks)
        || typeof sprite.blocks !== 'object') throw new ValidationError('file', null, '角色包缺少有效角色或造型。');
    validateScratchProject({ targets: [{ isStage: true }, sprite], extensions: sprite.extensions });
    // VM import can infer extensions directly from opcode prefixes, even when
    // sprite.extensions is absent. Mirror the editor's built-in-only boundary.
    const pending = [sprite];
    while (pending.length) {
        const value = pending.pop();
        if (!value || typeof value !== 'object') continue;
        for (const [key, child] of Object.entries(value)) {
            if ((key === 'opcode' && (typeof child !== 'string'
                || !/^(?:motion|looks|sound|event|control|sensing|operator|data|procedures|argument|pen|music|makeymakey)_[A-Za-z0-9_]+$/.test(child)))
                || (key.toLowerCase() === 'fonts' && child && (typeof child !== 'object' || Object.keys(child).length))) {
                throw new ValidationError('file', null, '角色包含不支持的扩展或外部字体。');
            }
            if (child && typeof child === 'object') pending.push(child);
        }
    }
    const referenced = new Set<string>();
    for (const [items, isSound] of [[sprite.costumes, false], [sprite.sounds, true]] as const) {
        for (const item of items) {
            if (!item || typeof item.assetId !== 'string' || !/^[a-f0-9]{32}$/.test(item.assetId)
                || typeof item.dataFormat !== 'string') throw new ValidationError('file', null, '角色素材引用无效。');
            const extension = `.${item.dataFormat.toLowerCase()}`;
            if (isSound ? !['.wav', '.mp3'].includes(extension) : !SPRITE_IMAGES.has(extension)) throw new ValidationError('file');
            const filename = `${item.assetId}${extension}`;
            if ((item.md5ext !== undefined && item.md5ext !== filename) || !media.has(filename)) {
                throw new ValidationError('file', null, '角色包缺少造型或声音文件。');
            }
            referenced.add(filename);
        }
    }
    // Reject hidden unrelated files even when they are valid media.
    if (referenced.size !== media.size) throw new ValidationError('file', null, '角色包包含未使用的文件。');
    for (const [filename, buffer] of media) validatePresetBytes(buffer, extname(filename));
}

export async function validateScratchPreset(filepath: string, filename: string, kind: unknown) {
    if (!SCRATCH_PRESET_KINDS.includes(kind as ScratchPresetKind)) throw new ValidationError('kind');
    const extension = extname(filename).toLowerCase();
    if (kind === 'sprite' && extension === '.sprite3') {
        return { size: await validateScratchArchive(filepath, true), mime: 'application/x.scratch.sprite3', extension };
    }
    if (kind === 'sound' ? !['.wav', '.mp3'].includes(extension) : !PRESET_IMAGES.has(extension)) {
        throw new ValidationError('file', null, '角色支持 SPRITE3 或图片；造型和背景支持 PNG/JPG/WebP/SVG；声音支持 WAV/MP3。');
    }
    const file = await open(filepath, 'r');
    try {
        const { size } = await file.stat();
        if (!size || size > SCRATCH_MAX_FILE_SIZE) throw new ValidationError('file', null, '素材不能超过 20 MB。');
        const buffer = await readFile(filepath);
        if (buffer.length !== size) throw new ValidationError('file');
        validatePresetBytes(buffer, extension);
        return { size, mime: extension === '.svg' ? 'image/svg+xml' : MATERIAL_TYPES[extension], extension };
    } finally {
        await file.close();
    }
}
