import { randomBytes } from 'crypto';
import { IdeError, IDE_LIMITS } from '../lib/ide_protocol';
import db from '../service/db';

export interface IdeFile {
    id: string; name: string; lang: string; code: string; revision: number; updatedAt: Date;
}
export class DuplicateIdeFileError extends IdeError {
    constructor(public readonly existing: Pick<IdeFile, 'id' | 'revision'>) {
        super('DUPLICATE_NAME', '已有同名程序。');
    }
}
interface IdeLibrary { _id: string; uid: number; domainId: string; files: IdeFile[] }
declare module '../service/db' { interface Collections { 'ide.file.library': IdeLibrary } }
export const libraries = db.collection('ide.file.library');
export const IDE_FILE_LIMIT = 50;
const key = (uid: number, domainId: string) => `${uid}:${domainId}`;
const invalid = (message: string) => { throw new IdeError('INVALID_MESSAGE', message); };
export function validateIdeFile(input: any, languages: string[]) {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80
        || /[\x00-\x1f\x7f/\\]/.test(input.name)) invalid('文件名请使用 1–80 个字符，不能包含路径。');
    if (typeof input.code !== 'string' || Buffer.byteLength(input.code) > IDE_LIMITS.codeBytes || input.code.includes('\0')) {
        invalid('代码文件不能超过 128 KB，且必须是文本文件。');
    }
    if (typeof input.lang !== 'string' || !languages.includes(input.lang)) invalid('请选择当前课堂支持的代码语言。');
    if (input.id !== undefined && (typeof input.id !== 'string' || !/^[a-f0-9]{24}$/.test(input.id))) invalid('文件编号无效。');
    if (input.id && (!Number.isSafeInteger(input.revision) || input.revision < 1)) invalid('文件版本无效，请重新打开。');
    return { name: input.name.trim(), lang: input.lang, code: input.code };
}
export async function listIdeFiles(uid: number, domainId: string) {
    const doc = await libraries.findOne({ _id: key(uid, domainId) }, { projection: { 'files.code': 0 } });
    return (doc?.files || []).sort((a, b) => +b.updatedAt - +a.updatedAt);
}
export async function getIdeFile(uid: number, domainId: string, id: string) {
    if (!/^[a-f0-9]{24}$/.test(id)) invalid('文件编号无效。');
    const doc = await libraries.findOne({ _id: key(uid, domainId), 'files.id': id }, { projection: { files: { $elemMatch: { id } } } });
    if (!doc?.files[0]) throw new IdeError('NOT_FOUND', '文件不存在或已经删除。');
    return doc.files[0];
}
export async function saveIdeFile(uid: number, domainId: string, input: any, languages: string[]) {
    const fields = validateIdeFile(input, languages);
    const id = input.id || randomBytes(12).toString('hex');
    const file: IdeFile = { ...fields, id, revision: input.id ? input.revision + 1 : 1, updatedAt: new Date() };
    const _id = key(uid, domainId);
    if (input.id) {
        const current = { id, revision: input.revision };
        const result = await libraries.updateOne({
            _id,
            files: { $elemMatch: current },
            // Historical duplicates can still be updated by ID, without allowing new duplicates on rename.
            $or: [{ files: { $elemMatch: { ...current, name: fields.name } } }, { 'files.name': { $ne: fields.name } }],
        }, { $set: { 'files.$[current]': file } }, {
            arrayFilters: [{ 'current.id': id, 'current.revision': input.revision }],
        });
        if (!result.matchedCount) throw new IdeError('CONFLICT', '文件已在其他页面修改或删除。请另存一份，或重新打开最新版本。');
    } else {
        // One bounded document makes capacity checks and writes atomic across workers.
        try { await libraries.updateOne({ _id }, { $setOnInsert: { uid, domainId, files: [] } }, { upsert: true }); }
        catch (error) { if (error.code !== 11000) throw error; }
        const result = await libraries.updateOne({
            _id,
            [`files.${IDE_FILE_LIMIT - 1}`]: { $exists: false },
            'files.name': { $ne: fields.name },
        }, { $push: { files: file } });
        if (!result.matchedCount) {
            const files = await listIdeFiles(uid, domainId);
            const existing = files.find((entry) => entry.name === fields.name);
            if (existing) throw new DuplicateIdeFileError({ id: existing.id, revision: existing.revision });
            if (files.length >= IDE_FILE_LIMIT) throw new IdeError('FILE_LIMIT', '云端最多保存 50 个文件，请先删除不需要的文件。');
            throw new IdeError('CONFLICT', '文件列表刚刚有变动，请重新点击保存。');
        }
    }
    return file;
}
export async function deleteIdeFile(uid: number, domainId: string, id: string, revision: number) {
    if (!/^[a-f0-9]{24}$/.test(id) || !Number.isSafeInteger(revision) || revision < 1) invalid('文件信息无效。');
    const result = await libraries.updateOne({ _id: key(uid, domainId), files: { $elemMatch: { id, revision } } }, { $pull: { files: { id, revision } } });
    if (!result.matchedCount) throw new IdeError('CONFLICT', '文件已变动，请刷新列表后重试。');
}
