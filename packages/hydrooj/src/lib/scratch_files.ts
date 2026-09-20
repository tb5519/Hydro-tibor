/* eslint-disable no-await-in-loop */
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
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
export async function validateScratchArchive(filepath: string) {
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
        const archiveEntries: { name: string, offset: number, compressed: number, size: number, method: number, flags: number }[] = [];
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
            archiveEntries.push({ name, offset: localOffset, compressed, size: entrySize, method, flags });
            offset = next;
        }
        const projectEntry = archiveEntries.find((entry) => entry.name === 'project.json');
        if (!projectEntry || projectEntry.size > MAX_PROJECT_JSON || projectEntry.compressed > MAX_PROJECT_JSON) {
            throw new ValidationError('file', null, '作品缺少 project.json，或项目描述超过 4 MB。');
        }
        let projectContent: Buffer;
        for (const entry of archiveEntries) {
            const local = await read(entry.offset, 30);
            if (local.readUInt32LE(0) !== 0x04034B50 || local.readUInt16LE(8) !== entry.method
                || local.readUInt16LE(6) !== entry.flags) throw new ValidationError('file');
            const nameSize = local.readUInt16LE(26);
            const dataStart = entry.offset + 30 + nameSize + local.readUInt16LE(28);
            if ((await read(entry.offset + 30, nameSize)).toString('utf8') !== entry.name
                || dataStart + entry.compressed > directoryOffset) throw new ValidationError('file');
            let actualSize = 0;
            const parts: Buffer[] = [];
            const sink = new Writable({
                write(chunk: Buffer, encoding, callback) {
                    actualSize += chunk.length;
                    if (actualSize > entry.size) {
                        callback(new ValidationError('file', null, '作品文件解压大小与声明不一致。'));
                        return;
                    }
                    if (entry.name === 'project.json') parts.push(chunk);
                    callback();
                },
            });
            try {
                if (entry.compressed) {
                    const input = createReadStream(filepath, { start: dataStart, end: dataStart + entry.compressed - 1 });
                    if (entry.method === 8) await pipeline(input, createInflateRaw({ chunkSize: 64 * 1024 }), sink);
                    else await pipeline(input, sink);
                }
                if (actualSize !== entry.size) throw new ValidationError('file', null, '作品文件解压大小与声明不一致。');
            } catch (error) {
                if (error instanceof ValidationError) throw error;
                throw new ValidationError('file', null, '作品压缩包损坏，无法读取。');
            }
            if (entry.name === 'project.json') projectContent = Buffer.concat(parts);
        }
        try {
            validateScratchProject(JSON.parse(projectContent.toString('utf8')));
        } catch (error) {
            if (error instanceof ValidationError) throw error;
            throw new ValidationError('file', null, '无法读取作品的 project.json。');
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
