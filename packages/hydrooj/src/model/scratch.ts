/* eslint-disable no-await-in-loop */
import { randomBytes } from 'crypto';
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { NotFoundError, PermissionError, ValidationError } from '../error';
import type { RemoteAsset } from '../interface';
import { queueAssetMirror } from '../lib/asset_delivery';
import { SCRATCH_PRESET_KINDS, ScratchPresetKind, validateScratchArchive, validateScratchMaterial, validateScratchPreset, validateScratchThumbnail } from '../lib/scratch_files';
import { mergeScratchState, ScratchStateValue, validateScratchStateChanges } from '../lib/scratch_state';
import { Logger } from '../logger';
import db from '../service/db';
import storage from './storage';

const logger = new Logger('scratch');

export interface ScratchActor { domainId: string, uid: number, isTeacher: boolean }
interface ScratchDoc { _id: ObjectId, domainId: string, owner: number, createdAt: Date, updatedAt: Date }
export interface ScratchAssignment extends ScratchDoc {
    title: string; description: string; deadline: Date | null; templateFileId: ObjectId | null;
}
export interface ScratchWork extends ScratchDoc {
    title: string; assignmentId: ObjectId | null; currentFileId: ObjectId | null; revision: number; thumbnailFileId?: ObjectId;
    savingToken?: ObjectId; savingUntil?: Date;
}
export interface ScratchVersion extends ScratchDoc { workId: ObjectId, fileId: ObjectId, revision: number }
export interface ScratchSubmission extends ScratchVersion {
    assignmentId: ObjectId; grade: string | null; feedback: string; reviewer: number | null; reviewedAt: Date | null;
}
export interface ScratchFile extends ScratchDoc {
    path: string; filename: string; size: number; mime: string;
    workId?: ObjectId; purpose?: 'thumbnail'; assignmentId?: ObjectId; materialId?: ObjectId; presetId?: ObjectId;
}
export interface ScratchMaterial extends ScratchDoc {
    title: string; category: string; recipientIds: number[]; fileId: ObjectId;
    fileName: string; size: number; assignmentId: ObjectId | null;
}
export interface ScratchPreset extends ScratchDoc {
    title: string; kind: ScratchPresetKind; fileId: ObjectId; filename: string; mime: string; size: number;
}
export const SCRATCH_MAX_PRESETS = 500;
export interface ScratchCommunityWork extends ScratchDoc {
    title: string; titleKey: string; instructions: string; workId: ObjectId; snapshotWorkId: ObjectId;
    fileId: ObjectId; thumbnailFileId: ObjectId | null; revision: number;
}
export interface ScratchCommunityEvent {
    _id: string; domainId: string; communityId: ObjectId; uid: number; isTeacher: boolean;
    likes: number; manualRuntimeSeconds: number; createdAt: Date;
}
export interface ScratchCommunityRuntime {
    _id: string; domainId: string; communityId: ObjectId; uid: number; isTeacher: boolean;
    runtimeSeconds: number; sessionId: string; startRequestId: string; lastSeq: number; lastHeartbeatAt: Date;
    sessionStartedAt: Date; sessionRuntimeSeconds: number;
}
export interface ScratchCommunityState {
    _id: string; domainId: string; communityId: ObjectId; fileId: ObjectId; revision: number;
    values: ScratchStateValue[]; clientFloorRevision: number; updatedAt: Date;
    clients: { id: string, uid: number, seq: number, requestId: string, revision: number }[];
}
export interface ScratchShare {
    _id: string; domainId: string; workId: ObjectId; fileId: ObjectId; revision: number; title: string; createdAt: Date;
}

// Each saved file has a new immutable ObjectId. Both download routes and the
// background mirror must use this same identity, including for shared snapshots.
export function fileAssetSource(file: ScratchFile, remoteAsset?: RemoteAsset) {
    const thumbnail = file.purpose === 'thumbnail';
    const preset = !!file.presetId;
    const archive = file.mime === 'application/x.scratch.sb3' || file.mime === 'application/x.scratch.sprite3';
    const presetTypes = {
        sprite3: 'application/x.scratch.sprite3', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        webp: 'image/webp', svg: 'image/svg+xml', wav: 'audio/wav', mp3: 'audio/mpeg',
    };
    const extension = /\.([a-z0-9]+)$/.exec(file.path)?.[1];
    if (preset ? presetTypes[extension] !== file.mime
        || file.path !== `scratch/${file.domainId}/${file._id}.${extension}`
        : thumbnail ? !(file.mime === 'image/png' && file.path.endsWith('.png'))
            : !(file.mime === 'application/x.scratch.sb3' && file.path.endsWith('.sb3'))) return null;
    return {
        path: file.path,
        meta: {
            etag: file._id.toHexString(), size: file.size, lastModified: file.createdAt,
            'Content-Type': archive ? 'application/octet-stream' : file.mime,
            ...(remoteAsset ? { remoteAsset } : {}),
        },
        contentDisposition: thumbnail ? 'inline' : preset ? 'attachment' : 'attachment; filename="project.sb3"',
        load: () => storage.get(file.path),
    };
}

async function mirrorFile(file: ScratchFile) {
    try {
        const meta = await storage.getMeta(file.path);
        const source = fileAssetSource(file, meta?.remoteAsset);
        if (source) queueAssetMirror(source);
    } catch (error) {
        // Delivery is optional; the verified primary copy has already been saved.
        logger.warn('Unable to prepare Scratch asset delivery', error);
    }
}

declare module '../service/db' {
    interface Collections {
        'scratch.assignment': ScratchAssignment;
        'scratch.work': ScratchWork;
        'scratch.version': ScratchVersion;
        'scratch.submission': ScratchSubmission;
        'scratch.file': ScratchFile;
        'scratch.material': ScratchMaterial;
        'scratch.preset': ScratchPreset;
        'scratch.share': ScratchShare;
        'scratch.community': ScratchCommunityWork;
        'scratch.community.event': ScratchCommunityEvent;
        'scratch.community.runtime': ScratchCommunityRuntime;
        'scratch.community.state': ScratchCommunityState;
        'scratch.quota': { _id: string, bytes: number };
    }
}

export const assignments = db.collection('scratch.assignment');
export const works = db.collection('scratch.work');
export const versions = db.collection('scratch.version');
export const submissions = db.collection('scratch.submission');
export const files = db.collection('scratch.file');
export const materials = db.collection('scratch.material');
export const presets = db.collection('scratch.preset');
export const shares = db.collection('scratch.share');
export const community = db.collection('scratch.community');
export const communityEvents = db.collection('scratch.community.event');
export const communityRuntimes = db.collection('scratch.community.runtime');
export const communityStates = db.collection('scratch.community.state');
export const quotas = db.collection('scratch.quota');

function base(actor: ScratchActor): ScratchDoc {
    return { _id: new ObjectId(), domainId: actor.domainId, owner: actor.uid, createdAt: new Date(), updatedAt: new Date() };
}
export function requireTeacher(actor: ScratchActor) {
    if (!actor.isTeacher) throw new PermissionError('Scratch 教学管理');
}
export function requireOwner(actor: ScratchActor, doc: ScratchDoc, allowTeacher = true) {
    if (!doc || doc.domainId !== actor.domainId || (doc.owner !== actor.uid && (!allowTeacher || !actor.isTeacher))) {
        throw new PermissionError('Scratch 作品访问');
    }
}
export function cleanText(value: unknown, field: string, max: number, fallback = '') {
    const text = `${value ?? fallback}`.trim();
    if ((!text && !fallback) || text.length > max) throw new ValidationError(field);
    return text || fallback;
}
export async function getAssignment(actor: ScratchActor, _id: ObjectId) {
    const doc = await assignments.findOne({ domainId: actor.domainId, _id });
    if (!doc) throw new NotFoundError('Scratch 作业');
    return doc;
}
export async function getWork(actor: ScratchActor, _id: ObjectId, write = false) {
    const doc = await works.findOne({ domainId: actor.domainId, _id });
    if (!doc) throw new NotFoundError('Scratch 作品');
    requireOwner(actor, doc, !write);
    return doc;
}
export async function getSubmission(actor: ScratchActor, _id: ObjectId) {
    const doc = await submissions.findOne({ domainId: actor.domainId, _id });
    if (!doc) throw new NotFoundError('Scratch 提交');
    requireOwner(actor, doc);
    return doc;
}
export async function getMaterial(actor: ScratchActor, _id: ObjectId) {
    const doc = await materials.findOne({ domainId: actor.domainId, _id });
    if (!doc) throw new NotFoundError('Scratch 素材');
    if (!actor.isTeacher && doc.recipientIds.length && !doc.recipientIds.includes(actor.uid)) throw new PermissionError('Scratch 素材访问');
    return doc;
}
export async function getFile(actor: ScratchActor, _id: ObjectId) {
    const doc = await files.findOne({ domainId: actor.domainId, _id });
    if (!doc) throw new NotFoundError('Scratch 文件');
    if (doc.presetId) {
        const preset = await getPreset(actor, doc.presetId);
        if (!preset.fileId.equals(doc._id)) throw new NotFoundError('Scratch 预制素材');
    } else if (doc.materialId) await getMaterial(actor, doc.materialId);
    else if (doc.workId) await getWork(actor, doc.workId);
    else if (doc.assignmentId) {
        const assignment = await getAssignment(actor, doc.assignmentId);
        if (!assignment.templateFileId?.equals(doc._id)) throw new NotFoundError('Scratch 模板');
    } else throw new PermissionError('Scratch 文件访问');
    return doc;
}
export function listWorks(actor: ScratchActor, assignmentId?: ObjectId, owner?: number) {
    return works.find({ domainId: actor.domainId, ...(!actor.isTeacher ? { owner: actor.uid } : owner ? { owner } : {}),
        ...(assignmentId ? { assignmentId } : {}) }).sort({ updatedAt: -1 });
}
export function listAssignments(actor: ScratchActor) {
    return assignments.find({ domainId: actor.domainId }).sort({ createdAt: -1 });
}
export function listSubmissions(actor: ScratchActor, extra: { workId?: ObjectId, purpose?: 'thumbnail', assignmentId?: ObjectId } = {}) {
    return submissions.find({ ...extra, domainId: actor.domainId, ...(!actor.isTeacher ? { owner: actor.uid } : {}) }).sort({ createdAt: -1 });
}
export function listMaterials(actor: ScratchActor, assignmentId?: ObjectId) {
    return materials.find({ domainId: actor.domainId, ...(assignmentId ? { assignmentId } : {}),
        ...(!actor.isTeacher ? { $or: [{ recipientIds: actor.uid }, { recipientIds: { $size: 0 } }] } : {}),
    }).sort({ category: 1, createdAt: -1 });
}

async function reserveFileBytes(actor: ScratchActor, size: number) {
    if (!await quotas.findOne({ _id: actor.domainId })) {
        const usage = await files.aggregate<{ total: number }>([
            { $match: { domainId: actor.domainId } }, { $group: { _id: null, total: { $sum: '$size' } } },
        ]).next();
        try {
            await quotas.updateOne({ _id: actor.domainId }, { $setOnInsert: { bytes: usage?.total || 0 } }, { upsert: true });
        } catch (error) {
            if (error.code !== 11000) throw error;
        }
    }
    const result = await quotas.updateOne({ _id: actor.domainId, bytes: { $lte: 2 * 1024 ** 3 - size } }, { $inc: { bytes: size } });
    if (!result.matchedCount) throw new ValidationError('file', null, '该 Scratch 域的文件已达到 2 GB，请先清理不需要的作品或素材。');
}
async function releaseFileBytes(actor: ScratchActor, size: number) {
    await quotas.updateOne({ _id: actor.domainId }, { $inc: { bytes: -size } });
}

async function putFile(
    actor: ScratchActor, upload: { filepath: string, originalFilename?: string }, relation: Partial<ScratchFile>, project: boolean, presetKind?: ScratchPresetKind,
) {
    const filename = cleanText(upload.originalFilename?.split(/[\\/]/).pop(), 'file', 200, project ? '作品.sb3' : '素材.txt');
    const meta = presetKind ? await validateScratchPreset(upload.filepath, filename, presetKind) : project
        ? { size: await validateScratchArchive(upload.filepath), mime: 'application/x.scratch.sb3', extension: '.sb3' }
        : await validateScratchMaterial(upload.filepath, filename);
    await reserveFileBytes(actor, meta.size);
    const doc: ScratchFile = { ...base(actor), ...relation, path: '', filename, size: meta.size, mime: meta.mime };
    doc.path = `scratch/${actor.domainId}/${doc._id}${meta.extension}`;
    try {
        await storage.put(doc.path, upload.filepath, actor.uid);
        await files.insertOne(doc);
    } catch (error) {
        await storage.del([doc.path], actor.uid);
        await releaseFileBytes(actor, meta.size);
        throw error;
    }
    await mirrorFile(doc);
    return doc;
}
async function putThumbnail(actor: ScratchActor, workId: ObjectId, buffer: Buffer) {
    await reserveFileBytes(actor, buffer.length);
    const doc: ScratchFile = {
        ...base(actor), workId, purpose: 'thumbnail', path: '', filename: 'thumbnail.png', size: buffer.length, mime: 'image/png',
    };
    doc.path = `scratch/${actor.domainId}/${doc._id}.png`;
    try {
        await storage.put(doc.path, buffer, actor.uid);
        await files.insertOne(doc);
    } catch (error) {
        await storage.del([doc.path], actor.uid);
        await releaseFileBytes(actor, doc.size);
        throw error;
    }
    await mirrorFile(doc);
    return doc;
}
async function removeFile(actor: ScratchActor, _id: ObjectId) {
    const doc = await files.findOne({ domainId: actor.domainId, _id });
    if (!doc) return;
    const references = await Promise.all([
        works.countDocuments({ domainId: actor.domainId, $or: [{ currentFileId: _id }, { thumbnailFileId: _id }] }),
        versions.countDocuments({ domainId: actor.domainId, fileId: _id }),
        submissions.countDocuments({ domainId: actor.domainId, fileId: _id }),
        shares.countDocuments({ domainId: actor.domainId, fileId: _id }),
        community.countDocuments({ domainId: actor.domainId, $or: [{ fileId: _id }, { thumbnailFileId: _id }] }),
        presets.countDocuments({ domainId: actor.domainId, fileId: _id }),
    ]);
    if (references.some(Boolean)) return;
    await storage.del([doc.path], actor.uid);
    const removed = await files.deleteOne({ domainId: actor.domainId, _id });
    if (removed.deletedCount) await releaseFileBytes(actor, doc.size);
}

export async function createWork(actor: ScratchActor, title: string, assignmentId: ObjectId = null, reuseTitle = true) {
    const assignment = assignmentId ? await getAssignment(actor, assignmentId) : null;
    const cleanTitle = cleanText(title, 'title', 120, assignment?.title || '我的 Scratch 作品');
    if (assignment) {
        const existing = await works.findOne({ domainId: actor.domainId, owner: actor.uid, assignmentId });
        if (existing) return existing;
    } else if (reuseTitle) {
        // A title is the name of one free creation for its author. Opening a
        // same-named creation should continue it rather than allocate another.
        const existing = await works.findOne({ domainId: actor.domainId, owner: actor.uid, assignmentId: null, title: cleanTitle },
            { sort: { updatedAt: -1 } });
        if (existing) return existing;
    }
    if (await works.countDocuments({ domainId: actor.domainId, owner: actor.uid }) >= 200) {
        throw new ValidationError('title', null, '每人最多保留 200 个作品。');
    }
    const doc: ScratchWork = {
        ...base(actor), title: cleanTitle,
        assignmentId, currentFileId: null, revision: 0,
    };
    try {
        await works.insertOne(doc);
    } catch (error) {
        if (error.code === 11000 && assignmentId) return works.findOne({ domainId: actor.domainId, owner: actor.uid, assignmentId });
        throw error;
    }
    return doc;
}
export async function createWorkFromMaterial(actor: ScratchActor, materialId: ObjectId, title?: string) {
    const material = await getMaterial(actor, materialId);
    const source = await getFile(actor, material.fileId);
    if (source.mime !== 'application/x.scratch.sb3') throw new ValidationError('materialId', null, '只有 SB3 素材可以直接创建作品。');
    const workTitle = cleanText(title || material.title, 'title', 120);
    const existing = await works.findOne({ domainId: actor.domainId, owner: actor.uid, assignmentId: null, title: workTitle });
    if (existing) return existing;
    const work = await createWork(actor, workTitle, null, false);
    const file: ScratchFile = {
        ...base(actor), filename: source.filename, size: source.size, mime: source.mime, path: '', workId: work._id,
    };
    file.path = `scratch/${actor.domainId}/${file._id}.sb3`;
    let reserved = false;
    try {
        await reserveFileBytes(actor, file.size);
        reserved = true;
        await storage.copy(source.path, file.path);
        await files.insertOne(file);
        await versions.insertOne({ ...base(actor), workId: work._id, fileId: file._id, revision: 1 });
        await works.updateOne({ domainId: actor.domainId, _id: work._id }, { $set: { currentFileId: file._id, revision: 1 } });
        await mirrorFile(file);
        return getWork(actor, work._id);
    } catch (error) {
        await works.deleteOne({ domainId: actor.domainId, _id: work._id });
        await versions.deleteMany({ domainId: actor.domainId, workId: work._id });
        await files.deleteOne({ domainId: actor.domainId, _id: file._id });
        await storage.del([file.path], actor.uid);
        if (reserved) await releaseFileBytes(actor, file.size);
        throw error;
    }
}
export async function renameWork(actor: ScratchActor, _id: ObjectId, title: string) {
    await getWork(actor, _id);
    await works.updateOne({ domainId: actor.domainId, _id }, {
        $set: { title: cleanText(title, 'title', 120), updatedAt: new Date() },
    });
}

async function copyWorkFile(actor: ScratchActor, workId: ObjectId, sourceId: ObjectId, thumbnail = false) {
    const source = await files.findOne({ domainId: actor.domainId, _id: sourceId });
    if (!source) throw new NotFoundError('Scratch 文件');
    const file: ScratchFile = {
        ...base(actor), workId, ...(thumbnail ? { purpose: 'thumbnail' as const } : {}),
        path: '', filename: source.filename, size: source.size, mime: source.mime,
    };
    file.path = `scratch/${actor.domainId}/${file._id}${thumbnail ? '.png' : '.sb3'}`;
    await reserveFileBytes(actor, file.size);
    try {
        await storage.copy(source.path, file.path);
        await files.insertOne(file);
    } catch (error) {
        await storage.del([file.path], actor.uid);
        await releaseFileBytes(actor, file.size);
        throw error;
    }
    await mirrorFile(file);
    return file;
}

export async function copyWork(actor: ScratchActor, sourceId: ObjectId) {
    const source = await getWork(actor, sourceId);
    const assignment = source.assignmentId ? await getAssignment(actor, source.assignmentId) : null;
    const sourceFileId = source.currentFileId || assignment?.templateFileId;
    if (await works.countDocuments({ domainId: actor.domainId, owner: actor.uid }) >= 200) {
        throw new ValidationError('title', null, '每人最多保留 200 个作品。');
    }
    const stem = source.title.slice(0, 110);
    let title = `${stem}（副本）`;
    for (let number = 2; await works.findOne({ domainId: actor.domainId, owner: actor.uid, assignmentId: null, title }); number++) {
        title = `${stem.slice(0, 110 - String(number).length)}（副本 ${number}）`;
    }
    const work: ScratchWork = {
        ...base(actor), title, assignmentId: null, currentFileId: null, revision: 0,
    };
    let project: ScratchFile;
    let thumbnail: ScratchFile;
    try {
        if (sourceFileId) {
            project = await copyWorkFile(actor, work._id, sourceFileId);
            work.currentFileId = project._id;
            work.revision = 1;
            await versions.insertOne({ ...base(actor), workId: work._id, fileId: project._id, revision: 1 });
        }
        if (source.thumbnailFileId) {
            thumbnail = await copyWorkFile(actor, work._id, source.thumbnailFileId, true);
            work.thumbnailFileId = thumbnail._id;
        }
        await works.insertOne(work);
        return work;
    } catch (error) {
        await versions.deleteMany({ domainId: actor.domainId, workId: work._id });
        if (project) await removeFile(actor, project._id);
        if (thumbnail) await removeFile(actor, thumbnail._id);
        throw error;
    }
}

export interface AssignmentInput { title: string, description: string, deadline: Date | null }
export async function writeAssignment(
    actor: ScratchActor, input: AssignmentInput, _id?: ObjectId, template?: { filepath: string, originalFilename?: string },
) {
    requireTeacher(actor);
    const current = _id ? await getAssignment(actor, _id) : null;
    const fields = {
        title: cleanText(input.title, 'title', 120), description: `${input.description || ''}`.trim(), deadline: input.deadline,
    };
    if (fields.description.length > 20000 || (fields.deadline && !Number.isFinite(fields.deadline.getTime()))) {
        throw new ValidationError('description', 'deadline');
    }
    const doc: ScratchAssignment = current || { ...base(actor), ...fields, templateFileId: null };
    const file = template ? await putFile(actor, template, { assignmentId: doc._id }, true) : null;
    try {
        if (current) {
            await assignments.updateOne({ domainId: actor.domainId, _id }, {
                $set: { ...fields, updatedAt: new Date(), ...(file ? { templateFileId: file._id } : {}) },
            });
        } else await assignments.insertOne({ ...doc, templateFileId: file?._id || null });
    } catch (error) {
        if (file) await removeFile(actor, file._id);
        throw error;
    }
    if (file && current?.templateFileId) await removeFile(actor, current.templateFileId);
    return getAssignment(actor, doc._id);
}
export async function writeMaterial(
    actor: ScratchActor, input: { title: string, category: string, recipientIds: number[], assignmentId?: ObjectId },
    upload?: { filepath: string, originalFilename?: string }, _id?: ObjectId,
) {
    requireTeacher(actor);
    const current = _id ? await getMaterial(actor, _id) : null;
    if (!current && !upload) throw new ValidationError('file');
    if (input.assignmentId) await getAssignment(actor, input.assignmentId);
    const fields = {
        title: cleanText(input.title, 'title', 120, upload?.originalFilename || current?.title || '学习素材'),
        category: cleanText(input.category, 'category', 40, '未分类'),
        recipientIds: [...new Set(input.recipientIds)], assignmentId: input.assignmentId || null,
    };
    if (fields.recipientIds.length > 500 || fields.recipientIds.some((uid) => !Number.isSafeInteger(uid) || uid < 1)) {
        throw new ValidationError('recipientIds');
    }
    const doc: ScratchMaterial = current || { ...base(actor), ...fields, fileId: null, fileName: '', size: 0 };
    const file = upload ? await putFile(actor, upload, { materialId: doc._id }, false) : null;
    const update = { ...fields, ...(file ? { fileId: file._id, fileName: file.filename, size: file.size } : {}), updatedAt: new Date() };
    try {
        if (current) await materials.updateOne({ domainId: actor.domainId, _id }, { $set: update });
        else await materials.insertOne({ ...doc, ...update });
    } catch (error) {
        if (file) await removeFile(actor, file._id);
        throw error;
    }
    if (file && current) await removeFile(actor, current.fileId);
    return getMaterial(actor, doc._id);
}
export async function deleteMaterial(actor: ScratchActor, _id: ObjectId) {
    requireTeacher(actor);
    const doc = await getMaterial(actor, _id);
    await materials.deleteOne({ domainId: actor.domainId, _id });
    await removeFile(actor, doc.fileId);
}


export function listPresets(actor: ScratchActor) {
    return presets.find({ domainId: actor.domainId }).sort({ createdAt: -1, _id: -1 }).limit(SCRATCH_MAX_PRESETS);
}
export async function getPreset(actor: ScratchActor, _id: ObjectId) {
    const doc = await presets.findOne({ domainId: actor.domainId, _id });
    if (!doc) throw new NotFoundError('Scratch 预制素材');
    return doc;
}
export async function createPreset(
    actor: ScratchActor, input: { title: string, kind: ScratchPresetKind }, upload: { filepath: string, originalFilename?: string },
) {
    requireTeacher(actor);
    if (!SCRATCH_PRESET_KINDS.includes(input.kind)) throw new ValidationError('kind');
    const title = cleanText(input.title, 'title', 120);
    if (await presets.countDocuments({ domainId: actor.domainId }) >= SCRATCH_MAX_PRESETS) {
        throw new ValidationError('file', null, '每个 Scratch 域最多保留 500 个预制素材，请先清理不需要的素材。');
    }
    const doc: ScratchPreset = { ...base(actor), title, kind: input.kind, fileId: null, filename: '', mime: '', size: 0 };
    const file = await putFile(actor, upload, { presetId: doc._id }, false, input.kind);
    Object.assign(doc, { fileId: file._id, filename: file.filename, mime: file.mime, size: file.size });
    try {
        await presets.insertOne(doc);
    } catch (error) {
        await removeFile(actor, file._id);
        throw error;
    }
    return doc;
}
export async function renamePreset(actor: ScratchActor, _id: ObjectId, title: string) {
    requireTeacher(actor);
    const doc = await presets.findOneAndUpdate({ domainId: actor.domainId, _id }, {
        $set: { title: cleanText(title, 'title', 120), updatedAt: new Date() },
    }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundError('Scratch 预制素材');
    return doc;
}
export async function deletePreset(actor: ScratchActor, _id: ObjectId) {
    requireTeacher(actor);
    const doc = await getPreset(actor, _id);
    await presets.deleteOne({ domainId: actor.domainId, _id });
    await removeFile(actor, doc.fileId);
}

async function pruneVersions(actor: ScratchActor, workId: ObjectId, currentRevision: number) {
    // Keep one editable version. Submitted files and published shares retain
    // their own references, so grading and existing links remain valid.
    const old = await versions.find({ domainId: actor.domainId, workId, revision: { $ne: currentRevision } }).toArray();
    for (const version of old) {
        await versions.deleteOne({ domainId: actor.domainId, _id: version._id });
        await removeFile(actor, version.fileId);
    }
}

// The short Mongo lease serializes a work across processes/tabs. The optimistic
// revision check stops stale browser saves from silently overwriting newer work.
async function lockWork(actor: ScratchActor, workId: ObjectId, revision: number, teacherWrite = false) {
    const work = await getWork(actor, workId, !teacherWrite);
    if (teacherWrite && (!actor.isTeacher || work.owner === actor.uid)) throw new PermissionError('Scratch 代学员保存');
    if (!Number.isSafeInteger(revision) || revision < 0) throw new ValidationError('revision');
    const token = new ObjectId();
    const doc = await works.findOneAndUpdate({
        domainId: actor.domainId, _id: workId, owner: work.owner, revision,
        $or: [{ savingUntil: { $exists: false } }, { savingUntil: { $lt: new Date() } }],
    }, { $set: { savingToken: token, savingUntil: new Date(Date.now() + 10 * 60 * 1000) } }, { returnDocument: 'after' });
    if (!doc) throw new ValidationError('revision', null, '作品已在其他窗口更新，或正在保存。请刷新后重试。');
    try {
        // A process may have died after staging a version but before publishing
        // the work pointer. Reconcile while holding the new lease so a routine
        // Hydro restart cannot leave revision + 1 permanently occupied.
        const staged = await versions.find({ domainId: actor.domainId, workId, revision: { $gt: doc.revision } }).toArray();
        const stagedSubmissions = await submissions.find({ domainId: actor.domainId, workId, revision: { $gt: doc.revision } }).toArray();
        await submissions.deleteMany({ domainId: actor.domainId, workId, revision: { $gt: doc.revision } });
        await versions.deleteMany({ domainId: actor.domainId, workId, revision: { $gt: doc.revision } });
        for (const stagedDoc of [...staged, ...stagedSubmissions]) await removeFile(actor, stagedDoc.fileId);
    } catch (error) {
        await works.updateOne({ domainId: actor.domainId, _id: workId, savingToken: token }, { $unset: { savingToken: '', savingUntil: '' } });
        throw error;
    }
    return { doc, token };
}
export async function saveWork(
    actor: ScratchActor, workId: ObjectId, revision: number, upload: { filepath: string, originalFilename?: string },
    submit = false, title?: string, thumbnailData?: string, teacherSave = false,
) {
    const work = await getWork(actor, workId, !teacherSave);
    if (teacherSave && (!actor.isTeacher || work.owner === actor.uid)) throw new PermissionError('Scratch 代学员保存');
    if (teacherSave && submit) throw new ValidationError('submit', null, '老师代学员保存时不能代提交作业。');
    const assignment = work.assignmentId ? await getAssignment(actor, work.assignmentId) : null;
    if (submit && (!assignment || (assignment.deadline && assignment.deadline.getTime() < Date.now()))) {
        throw new ValidationError('submit', null, '当前作品不能提交，或已超过作业截止时间。');
    }
    if (submit && await submissions.countDocuments({ domainId: actor.domainId, workId }) >= 50) {
        throw new ValidationError('submit', null, '每份作业最多提交 50 次。');
    }
    const cleanTitle = title === undefined ? work.title : cleanText(title, 'title', 120);
    const thumbnailBuffer = await validateScratchThumbnail(thumbnailData);
    const { token, doc: lockedWork } = await lockWork(actor, workId, revision, teacherSave);
    let file: ScratchFile;
    let thumbnail: ScratchFile;
    let published = false;
    const version: ScratchVersion = { ...base(actor), workId, fileId: null, revision: revision + 1 };
    const submission: ScratchSubmission = submit ? {
        ...version, _id: new ObjectId(), assignmentId: assignment._id, grade: null, feedback: '', reviewer: null, reviewedAt: null,
    } : null;
    try {
        file = await putFile(actor, upload, { workId }, true);
        if (thumbnailBuffer) thumbnail = await putThumbnail(actor, workId, thumbnailBuffer);
        version.fileId = file._id;
        if (submission) submission.fileId = file._id;
        await versions.insertOne(version);
        if (submission) await submissions.insertOne(submission);
        // Re-check the deadline after uploading/validation as well.
        if (submit) {
            const latest = await getAssignment(actor, assignment._id);
            if (latest.deadline && latest.deadline.getTime() < Date.now()) throw new ValidationError('submit', null, '作业已截止。');
        }
        const result = await works.updateOne({ domainId: actor.domainId, _id: workId, savingToken: token, revision }, {
            $set: { currentFileId: file._id, revision: revision + 1, title: cleanTitle, updatedAt: new Date(),
                ...(thumbnail ? { thumbnailFileId: thumbnail._id } : {}) },
            ...(!thumbnail ? { $unset: { thumbnailFileId: '' } } : {}),
        });
        if (!result.matchedCount) throw new ValidationError('revision', null, '保存状态发生变化，请刷新重试。');
        published = true;
        if (lockedWork.thumbnailFileId) {
            await removeFile(actor, lockedWork.thumbnailFileId).catch((error) => logger.warn('Could not remove old Scratch thumbnail: %s', error));
        }
        await pruneVersions(actor, workId, revision + 1).catch((error) => logger.warn('Could not prune old Scratch drafts: %s', error));
        if (!work.assignmentId) {
            const duplicates = await works.find({ domainId: actor.domainId, owner: work.owner, assignmentId: null,
                title: cleanTitle, _id: { $ne: workId } }).project<{ _id: ObjectId }>({ _id: 1 }).toArray();
            for (const duplicate of duplicates) {
                await deleteWork(actor, duplicate._id, workId).catch((error) => logger.warn('Could not remove duplicate Scratch work: %s', error));
            }
        }
        return { work: await getWork(actor, workId), submission };
    } finally {
        if (!published && file) {
            await versions.deleteOne({ domainId: actor.domainId, _id: version._id });
            if (submission) await submissions.deleteOne({ domainId: actor.domainId, _id: submission._id });
            await removeFile(actor, file._id);
            if (thumbnail) await removeFile(actor, thumbnail._id);
        }
        await works.updateOne({ domainId: actor.domainId, _id: workId, savingToken: token }, { $unset: { savingToken: '', savingUntil: '' } });
    }
}
// Fill a missing stage cover without creating a project revision or changing its
// recency. The same lease as saving prevents an old screenshot winning a race.
export async function cacheWorkThumbnail(actor: ScratchActor, workId: ObjectId, revision: number, data: string) {
    await getWork(actor, workId, true);
    const buffer = await validateScratchThumbnail(data);
    if (!buffer) throw new ValidationError('thumbnail');
    const { doc, token } = await lockWork(actor, workId, revision);
    let thumbnail: ScratchFile;
    let published = false;
    try {
        // An unsaved assignment still follows its teacher's replaceable template.
        if (doc.assignmentId && !doc.currentFileId) throw new ValidationError('thumbnail', null, '请先保存作业作品。');
        if (doc.thumbnailFileId) return doc.thumbnailFileId;
        thumbnail = await putThumbnail(actor, workId, buffer);
        const result = await works.updateOne({ domainId: actor.domainId, _id: workId, savingToken: token, revision }, {
            $set: { thumbnailFileId: thumbnail._id },
        });
        if (!result.matchedCount) throw new ValidationError('revision');
        published = true;
        return thumbnail._id;
    } finally {
        if (thumbnail && !published) await removeFile(actor, thumbnail._id);
        await works.updateOne({ domainId: actor.domainId, _id: workId, savingToken: token }, { $unset: { savingToken: '', savingUntil: '' } });
    }
}
export async function reviewSubmission(actor: ScratchActor, submissionId: ObjectId, grade: string | null, feedback: string) {
    requireTeacher(actor);
    await getSubmission(actor, submissionId);
    if (grade !== null && (typeof grade !== 'string' || grade.length > 40)) throw new ValidationError('grade');
    if (feedback.length > 20000) throw new ValidationError('feedback');
    await submissions.updateOne({ domainId: actor.domainId, _id: submissionId }, {
        $set: { grade, feedback: feedback.trim(), reviewer: actor.uid, reviewedAt: new Date(), updatedAt: new Date() },
    });
}

// Authorize the real caller first. Teachers may share a student's saved work,
// but the lease must use that work's owner so it serializes with normal saves.
async function lockSharedWork(actor: ScratchActor, workId: ObjectId) {
    const work = await getWork(actor, workId);
    return lockWork({ ...actor, uid: work.owner }, workId, work.revision);
}

export async function shareWork(actor: ScratchActor, workId: ObjectId) {
    const { doc, token } = await lockSharedWork(actor, workId);
    try {
        if (!doc.currentFileId || doc.revision < 1) throw new ValidationError('workId', null, '请先保存作品，再分享给朋友。');
        const existing = await shares.findOne({ domainId: actor.domainId, workId, revision: doc.revision });
        if (existing) return existing;
        const share: ScratchShare = {
            _id: randomBytes(32).toString('hex'), domainId: actor.domainId, workId, fileId: doc.currentFileId,
            revision: doc.revision, title: doc.title, createdAt: new Date(),
        };
        await shares.insertOne(share);
        return share;
    } finally {
        await works.updateOne({ domainId: actor.domainId, _id: workId, savingToken: token }, { $unset: { savingToken: '', savingUntil: '' } });
    }
}

export async function revokeWorkShares(actor: ScratchActor, workId: ObjectId) {
    const { token } = await lockSharedWork(actor, workId);
    try {
        const revoked = await shares.find({ domainId: actor.domainId, workId }).toArray();
        await shares.deleteMany({ domainId: actor.domainId, workId });
        for (const share of revoked) await removeFile(actor, share.fileId);
    } finally {
        await works.updateOne({ domainId: actor.domainId, _id: workId, savingToken: token }, { $unset: { savingToken: '', savingUntil: '' } });
    }
}

function communityTitleKey(title: string) {
    return title.normalize('NFKC').trim();
}

export function listCommunityWorks(actor: ScratchActor, query = '', mine = false) {
    const q = cleanText(query, 'q', 80, ' ').trim();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return community.find({ domainId: actor.domainId, ...(mine ? { owner: actor.uid } : {}),
        ...(q ? { title: { $regex: escaped, $options: 'i' } } : {}),
    }).sort({ updatedAt: -1, _id: -1 });
}

export async function getCommunityWork(actor: ScratchActor, _id: ObjectId) {
    const doc = await community.findOne({ domainId: actor.domainId, _id });
    if (!doc) throw new NotFoundError('社区作品');
    return doc;
}

function stateResponse(publication: ScratchCommunityWork, state?: ScratchCommunityState) {
    // Session sequencing and member identities are never exposed to players.
    return { ok: true, fileId: publication.fileId.toHexString(), revision: state?.revision || 0, values: state?.values || [] };
}
export async function getCommunityState(actor: ScratchActor, id: ObjectId) {
    const publication = await getCommunityWork(actor, id);
    const state = await communityStates.findOne({ _id: `${actor.domainId}:${id}`, domainId: actor.domainId });
    return stateResponse(publication, state);
}

export async function syncCommunityState(actor: ScratchActor, id: ObjectId, input: {
    requestId: unknown, clientId: unknown, seq: unknown, fileId: unknown, baseRevision: unknown, changes: unknown,
}) {
    const requestId = metricRequestId(input.requestId);
    const clientId = metricRequestId(input.clientId);
    const seq = metricInteger(input.seq, 'seq', Number.MAX_SAFE_INTEGER);
    const baseRevision = metricInteger(input.baseRevision, 'baseRevision', Number.MAX_SAFE_INTEGER);
    if (!seq || typeof input.fileId !== 'string' || !/^[a-f0-9]{24}$/.test(input.fileId)) throw new ValidationError('fileId');
    const changes = validateScratchStateChanges(input.changes);
    const _id = `${actor.domainId}:${id}`;
    // All changed variables and parallel lists commit together. A CAS retry
    // rebases the delta against another child's accepted append, preserving it.
    for (let attempt = 0; attempt < 30; attempt++) {
        const publication = await getCommunityWork(actor, id);
        if (publication.fileId.toHexString() !== input.fileId) {
            throw new ValidationError('fileId', null, '作品已更新，请重新打开后继续。');
        }
        const previous = await communityStates.findOne({ _id, domainId: actor.domainId });
        const revision = previous?.revision || 0;
        const clients = previous?.clients || [];
        const client = clients.find((entry) => entry.id === clientId && entry.uid === actor.uid);
        if (baseRevision > revision) throw new ValidationError('baseRevision');
        if (client && seq <= client.seq) {
            if (seq === client.seq && requestId !== client.requestId) throw new ValidationError('requestId');
            return { ...stateResponse(publication, previous), accepted: true };
        }
        if (baseRevision < (previous?.clientFloorRevision || 0) || seq !== (client?.seq || 0) + 1) {
            throw new ValidationError('seq', null, '运行数据连接已过期，请重新打开作品。');
        }
        const values = mergeScratchState(previous?.values || [], changes);
        const nextClients = clients.filter((entry) => entry !== client);
        nextClients.push({ id: clientId, uid: actor.uid, seq, requestId, revision: revision + 1 });
        const evicted = nextClients.length > 256 ? nextClients.shift() : null;
        const next: ScratchCommunityState = { _id, domainId: actor.domainId, communityId: id,
            fileId: publication.fileId, revision: revision + 1, values, clients: nextClients, updatedAt: new Date(),
            clientFloorRevision: Math.max(previous?.clientFloorRevision || 0, evicted?.revision || 0) };
        try {
            if (previous) {
                const result = await communityStates.replaceOne({ _id, domainId: actor.domainId, revision }, next);
                if (!result.modifiedCount) continue;
            } else await communityStates.insertOne(next);
            return { ...stateResponse(publication, next), accepted: true };
        } catch (error) {
            if (error.code !== 11000) throw error;
        }
    }
    throw new ValidationError('changes', null, '同时保存的同学较多，请稍后再试。');
}

// Events are authoritative: no counter write can be lost between an idempotency
// check and increment. Totals and ranking use the same aggregation before paging.
function communityMetricStages() {
    return [
        { $lookup: { from: communityEvents.collectionName, let: { id: '$_id', domain: '$domainId' }, pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$communityId', '$$id'] }, { $eq: ['$domainId', '$$domain'] }] } } },
            { $group: { _id: null, likes: { $sum: '$likes' }, manualRuntimeSeconds: { $sum: '$manualRuntimeSeconds' },
                studentLikes: { $sum: { $cond: ['$isTeacher', 0, '$likes'] } }, teacherLikes: { $sum: { $cond: ['$isTeacher', '$likes', 0] } } } },
        ], as: '_events' } },
        { $lookup: { from: communityRuntimes.collectionName, let: { id: '$_id', domain: '$domainId' }, pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$communityId', '$$id'] }, { $eq: ['$domainId', '$$domain'] }] } } },
            { $group: { _id: null, seconds: { $sum: '$runtimeSeconds' } } },
        ], as: '_runtime' } },
        { $set: {
            likes: { $ifNull: [{ $arrayElemAt: ['$_events.likes', 0] }, 0] },
            studentLikes: { $ifNull: [{ $arrayElemAt: ['$_events.studentLikes', 0] }, 0] },
            teacherLikes: { $ifNull: [{ $arrayElemAt: ['$_events.teacherLikes', 0] }, 0] },
            actualRuntimeSeconds: { $ifNull: [{ $arrayElemAt: ['$_runtime.seconds', 0] }, 0] },
            manualRuntimeSeconds: { $ifNull: [{ $arrayElemAt: ['$_events.manualRuntimeSeconds', 0] }, 0] },
        } },
        { $set: { runtimeSeconds: { $add: ['$actualRuntimeSeconds', '$manualRuntimeSeconds'] } } },
        { $unset: ['_events', '_runtime'] },
    ];
}

export function communityRuntimeLabel(seconds: number) {
    if (seconds < 60) return `${seconds} 秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
    return `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`;
}

export async function pageCommunityWorks(actor: ScratchActor, query = '', mine = false, sort = 'hot', page = 1, pageSize = 24) {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1
        || !Number.isSafeInteger((page - 1) * pageSize)) throw new ValidationError('page');
    const q = cleanText(query, 'q', 80, ' ').trim();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = { domainId: actor.domainId, ...(mine ? { owner: actor.uid } : {}),
        ...(q ? { title: { $regex: escaped, $options: 'i' } } : {}) };
    const count = await community.countDocuments(match);
    const docs = await community.aggregate<ScratchCommunityWork & { likes: number, runtimeSeconds: number }>([
        { $match: match }, ...communityMetricStages(),
        { $set: { hotScore: { $divide: [
            { $add: [{ $multiply: [5, '$likes'] }, { $multiply: [2, { $sqrt: { $divide: ['$runtimeSeconds', 60] } }] }] },
            { $pow: [{ $add: [{ $max: [0, { $divide: [{ $subtract: ['$$NOW', '$createdAt'] }, 86400000] }] }, 2] }, 0.8] },
        ] } } },
        { $sort: sort === 'latest' ? { updatedAt: -1, _id: -1 } : { hotScore: -1, updatedAt: -1, _id: -1 } },
        { $skip: (page - 1) * pageSize }, { $limit: pageSize },
        // The public list receives totals only, never the teacher breakdown.
        { $unset: ['studentLikes', 'teacherLikes', 'actualRuntimeSeconds', 'manualRuntimeSeconds', 'hotScore'] },
    ]).toArray();
    return { communityWorks: docs.map((doc) => ({ ...doc, runtimeLabel: communityRuntimeLabel(doc.runtimeSeconds) })),
        count, pcount: Math.ceil(count / pageSize) };
}

function communityDay(now = new Date()) {
    // A single classroom day is used for all learners, including those abroad.
    return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
function metricRequestId(value: unknown) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(value)) throw new ValidationError('requestId');
    return value;
}
function metricInteger(value: unknown, field: string, max: number) {
    if (typeof value !== 'number' && typeof value !== 'string') throw new ValidationError(field);
    const number = +value;
    if (`${value}`.trim() === '' || !Number.isSafeInteger(number) || number < 0 || number > max) throw new ValidationError(field);
    return number;
}
function studentLikeId(actor: ScratchActor, id: ObjectId, now = new Date()) {
    return `${actor.domainId}:${id}:${actor.uid}:day:${communityDay(now)}`;
}
async function communityTotals(actor: ScratchActor, id: ObjectId) {
    const doc = await community.aggregate([{ $match: { _id: id, domainId: actor.domainId } }, ...communityMetricStages()]).next();
    if (!doc) throw new NotFoundError('社区作品');
    return doc;
}
export async function getCommunityMetrics(actor: ScratchActor, id: ObjectId) {
    const totals = await communityTotals(actor, id);
    const likedToday = !actor.isTeacher && !!await communityEvents.findOne({ _id: studentLikeId(actor, id) }, { projection: { _id: 1 } });
    return { ok: true, likes: totals.likes, runtimeSeconds: totals.runtimeSeconds,
        runtimeLabel: communityRuntimeLabel(totals.runtimeSeconds), likedToday, canLike: actor.isTeacher || !likedToday, isTeacher: actor.isTeacher };
}
async function insertCommunityEvent(event: ScratchCommunityEvent) {
    try {
        await communityEvents.updateOne({ _id: event._id }, { $setOnInsert: event }, { upsert: true });
    } catch (error) {
        // Concurrent retries of one event have exactly one authoritative row.
        if (error.code !== 11000) throw error;
    }
}
export async function likeCommunityWork(actor: ScratchActor, id: ObjectId, requestId: unknown) {
    await getCommunityWork(actor, id);
    const key = metricRequestId(requestId);
    await insertCommunityEvent({ _id: actor.isTeacher ? `${actor.domainId}:${id}:${actor.uid}:like:${key}` : studentLikeId(actor, id),
        domainId: actor.domainId, communityId: id, uid: actor.uid, isTeacher: actor.isTeacher,
        likes: 1, manualRuntimeSeconds: 0, createdAt: new Date() });
    return getCommunityMetrics(actor, id);
}
export async function adjustCommunityMetrics(actor: ScratchActor, id: ObjectId, requestId: unknown, likes: unknown, seconds: unknown) {
    requireTeacher(actor);
    await getCommunityWork(actor, id);
    const key = metricRequestId(requestId);
    const likeCount = metricInteger(likes, 'likes', 1000000);
    const runtimeSeconds = metricInteger(seconds, 'runtimeSeconds', 31536000);
    if (!likeCount && !runtimeSeconds) throw new ValidationError('likes', null, '请输入要增加的点赞数或运行时长。');
    await insertCommunityEvent({ _id: `${actor.domainId}:${id}:${actor.uid}:adjust:${key}`,
        domainId: actor.domainId, communityId: id, uid: actor.uid, isTeacher: true,
        likes: likeCount, manualRuntimeSeconds: runtimeSeconds, createdAt: new Date() });
}
export async function getCommunityAnalytics(actor: ScratchActor, id: ObjectId) {
    requireTeacher(actor);
    const totals = await communityTotals(actor, id);
    const eventActors = await communityEvents.aggregate<{ _id: number, likes: number, isTeacher: boolean }>([
        { $match: { domainId: actor.domainId, communityId: id } },
        { $group: { _id: '$uid', likes: { $sum: '$likes' }, isTeacher: { $max: '$isTeacher' } } },
    ]).toArray();
    const runtimes = await communityRuntimes.find({ domainId: actor.domainId, communityId: id },
        { projection: { uid: 1, isTeacher: 1, runtimeSeconds: 1 } }).toArray();
    const participants = new Map<number, { uid: number, isTeacher: boolean, likes: number, runtimeSeconds: number }>();
    for (const row of eventActors) participants.set(row._id, { uid: row._id, isTeacher: row.isTeacher, likes: row.likes, runtimeSeconds: 0 });
    for (const row of runtimes) {
        const existing = participants.get(row.uid);
        participants.set(row.uid, { uid: row.uid, isTeacher: row.isTeacher || existing?.isTeacher || false,
            likes: existing?.likes || 0, runtimeSeconds: row.runtimeSeconds });
    }
    return { ok: true, likes: totals.likes, runtimeSeconds: totals.runtimeSeconds,
        actualRuntimeSeconds: totals.actualRuntimeSeconds, manualRuntimeSeconds: totals.manualRuntimeSeconds,
        studentLikes: totals.studentLikes, teacherLikes: totals.teacherLikes,
        participants: [...participants.values()].sort((a, b) => b.runtimeSeconds - a.runtimeSeconds || b.likes - a.likes || a.uid - b.uid) };
}
export async function startCommunityRuntime(actor: ScratchActor, id: ObjectId, requestId: unknown) {
    await getCommunityWork(actor, id);
    const key = metricRequestId(requestId);
    const _id = `${actor.domainId}:${id}:${actor.uid}`;
    const sessionId = randomBytes(24).toString('hex');
    const now = new Date();
    let session: ScratchCommunityRuntime;
    for (let attempt = 0; ; attempt++) {
        try {
            session = await communityRuntimes.findOneAndUpdate({ _id }, [{ $set: {
                domainId: actor.domainId, communityId: id, uid: actor.uid, isTeacher: actor.isTeacher,
                runtimeSeconds: { $ifNull: ['$runtimeSeconds', 0] },
                sessionId: { $cond: [{ $eq: ['$startRequestId', key] }, '$sessionId', sessionId] },
                lastSeq: { $cond: [{ $eq: ['$startRequestId', key] }, '$lastSeq', 0] },
                lastHeartbeatAt: { $cond: [{ $eq: ['$startRequestId', key] }, '$lastHeartbeatAt', now] },
                sessionStartedAt: { $cond: [{ $eq: ['$startRequestId', key] }, '$sessionStartedAt', now] },
                sessionRuntimeSeconds: { $cond: [{ $eq: ['$startRequestId', key] }, '$sessionRuntimeSeconds', 0] },
                startRequestId: key,
            } }], { upsert: true, returnDocument: 'after' });
            break;
        } catch (error) {
            if (error.code !== 11000 || attempt >= 2) throw error;
        }
    }
    return { ...await getCommunityMetrics(actor, id), sessionId: session.sessionId };
}
export async function heartbeatCommunityRuntime(actor: ScratchActor, id: ObjectId, token: unknown, sequence: unknown, seconds: unknown) {
    await getCommunityWork(actor, id);
    if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) throw new ValidationError('sessionId');
    const seq = metricInteger(sequence, 'seq', Number.MAX_SAFE_INTEGER);
    const requestedSeconds = metricInteger(seconds, 'seconds', 30);
    if (!seq) throw new ValidationError('seq');
    const _id = `${actor.domainId}:${id}:${actor.uid}`;
    const session = await communityRuntimes.findOne({ _id });
    const now = new Date();
    const elapsed = session ? now.getTime() - session.lastHeartbeatAt.getTime() : Infinity;
    const sessionExpired = !session || session.sessionId !== token || elapsed > 60000;
    let accepted = false;
    if (!sessionExpired && seq > session.lastSeq) {
        const allowance = Math.floor((now.getTime() - session.sessionStartedAt.getTime()) / 1000) - session.sessionRuntimeSeconds;
        const credit = Math.min(requestedSeconds, 30, Math.max(0, allowance));
        const result = await communityRuntimes.updateOne({ _id, sessionId: token, lastSeq: session.lastSeq,
            lastHeartbeatAt: session.lastHeartbeatAt }, { $set: { lastSeq: seq, lastHeartbeatAt: now }, $inc: { runtimeSeconds: credit, sessionRuntimeSeconds: credit } });
        accepted = !!result.modifiedCount;
    }
    return { ...await getCommunityMetrics(actor, id), accepted, sessionExpired };
}

export async function getWorkCommunityPublication(actor: ScratchActor, workId: ObjectId) {
    const work = await getWork(actor, workId);
    const publication = await community.findOne({ domainId: actor.domainId, owner: work.owner, titleKey: communityTitleKey(work.title) });
    return { work, publication };
}

export async function getCommunityFile(actor: ScratchActor, _id: ObjectId, thumbnail = false) {
    const doc = await getCommunityWork(actor, _id);
    const fileId = thumbnail ? doc.thumbnailFileId : doc.fileId;
    if (!fileId) throw new NotFoundError('社区作品文件');
    const file = await files.findOne({ domainId: actor.domainId, _id: fileId, workId: doc.snapshotWorkId,
        ...(thumbnail ? { purpose: 'thumbnail', mime: 'image/png' } : { mime: 'application/x.scratch.sb3' }),
    });
    if (!file) throw new NotFoundError('社区作品文件');
    return file;
}

async function removeCommunityFiles(actor: ScratchActor, doc: ScratchCommunityWork) {
    for (const fileId of [doc?.fileId, doc?.thumbnailFileId].filter(Boolean)) {
        await removeFile(actor, fileId).catch((error) => logger.warn('Could not remove old Scratch community file: %s', error));
    }
}

export async function publishCommunityWork(actor: ScratchActor, workId: ObjectId, instructions: unknown = '') {
    if (typeof instructions !== 'string' || instructions.trim().length > 300) throw new ValidationError('instructions');
    const { doc, token } = await lockSharedWork(actor, workId);
    try {
        if (!doc.currentFileId || doc.revision < 1) throw new ValidationError('workId', null, '先保存作品，再邀请小伙伴来玩吧。');
        const identity = { domainId: actor.domainId, owner: doc.owner, titleKey: communityTitleKey(doc.title) };
        const now = new Date();
        const initial = { _id: new ObjectId(), ...identity, createdAt: now };
        const fields = { title: doc.title, instructions: instructions.trim(), workId, snapshotWorkId: workId,
            fileId: doc.currentFileId, thumbnailFileId: doc.thumbnailFileId || null, revision: doc.revision, updatedAt: now };
        let previous: ScratchCommunityWork = null;
        // Distinct source works can have the same title. Their work leases are
        // separate, so the unique identity and atomic upsert are both required.
        for (let attempt = 0; ; attempt++) {
            try {
                previous = await community.findOneAndUpdate(identity, { $set: fields, $setOnInsert: initial },
                    { upsert: true, returnDocument: 'before' });
                break;
            } catch (error) {
                if (error.code !== 11000 || attempt >= 2) throw error;
            }
        }
        const publication: ScratchCommunityWork = { ...(previous || initial), ...fields };
        if (previous) await removeCommunityFiles(actor, previous);
        return { publication, updated: !!previous };
    } finally {
        await works.updateOne({ domainId: actor.domainId, _id: workId, savingToken: token }, { $unset: { savingToken: '', savingUntil: '' } });
    }
}

export async function unpublishCommunityWork(actor: ScratchActor, _id: ObjectId) {
    const doc = await getCommunityWork(actor, _id);
    requireOwner(actor, doc);
    // Only the community entry is removed. Drafts, submissions and external
    // links retain their separate references to immutable files.
    const removed = await community.findOneAndDelete({ domainId: actor.domainId, _id, owner: doc.owner });
    if (removed) await removeCommunityFiles(actor, removed);
}

export async function getPublicShare(domainId: string, token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new NotFoundError('分享作品');
    const share = await shares.findOne({ domainId, _id: token });
    if (!share || !await works.findOne({ domainId, _id: share.workId })) throw new NotFoundError('分享作品');
    const file = await files.findOne({ domainId, _id: share.fileId, workId: share.workId, mime: 'application/x.scratch.sb3' });
    if (!file) throw new NotFoundError('分享作品');
    return { share, file };
}

export async function deleteWork(actor: ScratchActor, workId: ObjectId, mergeIntoWorkId?: ObjectId) {
    const work = await getWork(actor, workId);
    if (mergeIntoWorkId) {
        const target = await getWork(actor, mergeIntoWorkId);
        if (target._id.equals(workId) || target.owner !== work.owner || communityTitleKey(target.title) !== communityTitleKey(work.title)) {
            throw new ValidationError('workId');
        }
    }
    const { token } = await lockWork(actor, workId, work.revision, actor.isTeacher && work.owner !== actor.uid);
    try {
        if (mergeIntoWorkId) {
            // Same-title draft consolidation keeps the published snapshot exactly
            // as it was; only its future editing destination moves to the survivor.
            await community.updateMany({ domainId: actor.domainId, workId }, { $set: { workId: mergeIntoWorkId } });
        }
        const docs = await files.find({ domainId: actor.domainId, workId }).toArray();
        const removed = await works.deleteOne({ domainId: actor.domainId, _id: workId, savingToken: token });
        if (!removed.deletedCount) throw new ValidationError('workId', null, '作品正在被其他窗口修改，请刷新后重试。');
        await versions.deleteMany({ domainId: actor.domainId, workId });
        await submissions.deleteMany({ domainId: actor.domainId, workId });
        await shares.deleteMany({ domainId: actor.domainId, workId });
        const published = await community.find({ domainId: actor.domainId, workId }).toArray();
        await community.deleteMany({ domainId: actor.domainId, workId });
        for (const doc of published) await removeCommunityFiles(actor, doc);
        for (const file of docs) await removeFile(actor, file._id);
    } finally {
        await works.updateOne({ domainId: actor.domainId, _id: workId, savingToken: token }, { $unset: { savingToken: '', savingUntil: '' } });
    }
}

export async function apply(ctx: Context) {
    ctx.on('domain/delete', async (domainId) => {
        const docs = await files.find({ domainId }).toArray();
        await storage.del(docs.map((doc) => doc.path));
        await Promise.all([assignments, works, versions, submissions, materials, presets, files, shares, community, communityEvents, communityRuntimes, communityStates].map((collection) => collection.deleteMany({ domainId })));
        await quotas.deleteOne({ _id: domainId });
    });
    await Promise.all([
        db.ensureIndexes(assignments, { key: { domainId: 1, createdAt: -1 }, name: 'scratch_assignments' }),
        db.ensureIndexes(works, { key: { domainId: 1, owner: 1, updatedAt: -1 }, name: 'scratch_works' },
            { key: { domainId: 1, owner: 1, assignmentId: 1 }, name: 'scratch_assignment_owner',
                unique: true, partialFilterExpression: { assignmentId: { $type: 'objectId' } } }),
        db.ensureIndexes(versions, { key: { domainId: 1, workId: 1, revision: -1 }, name: 'scratch_versions', unique: true }),
        db.ensureIndexes(submissions, { key: { domainId: 1, workId: 1, revision: -1 }, name: 'scratch_submissions', unique: true },
            { key: { domainId: 1, assignmentId: 1, createdAt: -1 }, name: 'scratch_assignment_submissions' }),
        db.ensureIndexes(presets, { key: { domainId: 1, createdAt: -1, _id: -1 }, name: 'scratch_presets' }),
        db.ensureIndexes(materials, { key: { domainId: 1, category: 1 }, name: 'scratch_materials' }),
        db.ensureIndexes(files, { key: { domainId: 1, workId: 1 }, name: 'scratch_files' }),
        db.ensureIndexes(community,
            { key: { domainId: 1, owner: 1, titleKey: 1 }, name: 'scratch_community_author_title', unique: true },
            { key: { domainId: 1, updatedAt: -1, _id: -1 }, name: 'scratch_community_recent' },
            { key: { domainId: 1, workId: 1 }, name: 'scratch_community_work' },
            { key: { domainId: 1, fileId: 1 }, name: 'scratch_community_file' },
            { key: { domainId: 1, thumbnailFileId: 1 }, name: 'scratch_community_thumbnail' }),
        db.ensureIndexes(communityEvents, { key: { domainId: 1, communityId: 1, uid: 1 }, name: 'scratch_community_events' }),
        db.ensureIndexes(communityRuntimes, { key: { domainId: 1, communityId: 1, uid: 1 }, name: 'scratch_community_runtimes', unique: true }),
        db.ensureIndexes(communityStates, { key: { domainId: 1, communityId: 1 }, name: 'scratch_community_states', unique: true }),
        db.ensureIndexes(shares, { key: { domainId: 1, workId: 1, revision: 1 }, name: 'scratch_share_revision', unique: true },
            { key: { domainId: 1, fileId: 1 }, name: 'scratch_share_file' }),
    ]);
}
