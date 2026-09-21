/* eslint-disable no-await-in-loop */
import { extname } from 'path';
import { createHash, randomBytes } from 'crypto';
import { escapeRegExp } from 'lodash';
import moment from 'moment-timezone';
import { nanoid } from 'nanoid';
import type { Readable } from 'stream';
import type { Collection } from 'mongodb';
import type { FileNode, RemoteAsset } from '../interface';
import type { AssetProcessIdentity, AssetStorage } from './asset_storage';
import { assetProcessIdentity, eligibleAsset, provenAssetProcessDead } from './asset_storage';
import mime from './mime';

export interface AssetReferenceGate {
    _id: string;
    state?: 'ready' | 'deleting' | 'deleted';
    writers?: number;
    writerOwners?: Record<string, number>;
    deletingOwner?: string;
    process?: AssetProcessIdentity;
    remoteAsset?: RemoteAsset;
}

const remoteIdentity = (asset: RemoteAsset) => `remote:${createHash('sha256').update(JSON.stringify([asset.bucket, asset.region, asset.key])).digest('hex')}`;
const physicalIdentity = (file: FileNode) => file.remoteAsset ? remoteIdentity(file.remoteAsset) : `local:${file.link || file._id}`;
const remoteQuery = (asset: RemoteAsset) => ({
    'remoteAsset.key': asset.key, 'remoteAsset.bucket': asset.bucket, 'remoteAsset.region': asset.region,
});
const localQuery = (physicalId: string) => ({ remoteAsset: { $exists: false }, $or: [{ _id: physicalId }, { link: physicalId }] });

/** Shared by the live model and the standalone migration tool; never boots Hydro. */
export function createAssetStorageModel(dependencies: {
    coll: Collection<FileNode>;
    assets: Collection<AssetReferenceGate>;
    storage: {
        put: (id: string, file: string | Buffer | Readable, meta?: Record<string, string>) => Promise<unknown>;
        get: (id: string, savePath?: string) => Promise<Readable | null>;
        getMeta: (id: string) => Promise<{ metaData: Record<string, string | number>; size: number; etag: string }>;
        del: (id: string) => Promise<unknown>;
        signDownloadLink: (id: string, filename?: string, noExpire?: boolean, endpoint?: 'user' | 'judge') => Promise<string>;
    };
    assetStorage: AssetStorage;
    /** Injectable process identity checks keep crash-recovery tests deterministic. */
    ownerProcess?: AssetReferenceGate['process'];
    isOwnerDead?: typeof provenAssetProcessDead;
}) {
    const { storage, assetStorage } = dependencies;
    const owner = randomBytes(16).toString('hex');
    const ownerProcess = dependencies.ownerProcess || assetProcessIdentity();
    const isOwnerDead = dependencies.isOwnerDead || provenAssetProcessDead;
    let ownerRegistration: Promise<unknown>;
    return class StorageModel {
        static coll = dependencies.coll;
        static assets = dependencies.assets;

        static async ensureOwner() {
            ownerRegistration ||= this.assets.updateOne({ _id: `process:${owner}` }, {
                $setOnInsert: { process: ownerProcess },
            }, { upsert: true }).catch((error) => { ownerRegistration = null; throw error; });
            await ownerRegistration;
        }

        static async initializeGate(id: string) {
            try {
                await this.assets.updateOne({ _id: id }, { $setOnInsert: { state: 'ready', writers: 0 } }, { upsert: true });
            } catch (error) {
                if (error.code !== 11000) throw error;
            }
        }

        static async acquireWriter(file: FileNode) {
            const id = physicalIdentity(file);
            await this.ensureOwner();
            if (!file.remoteAsset) await this.initializeGate(id);
            const result = await this.assets.updateOne({ _id: id, state: 'ready' }, { $inc: { writers: 1, [`writerOwners.${owner}`]: 1 } });
            if (!result.matchedCount) throw new Error('File is being removed; retry the operation');
            return id;
        }

        static async releaseWriter(id: string) {
            await this.assets.updateOne({ _id: id, [`writerOwners.${owner}`]: { $gt: 0 } }, {
                $inc: { writers: -1, [`writerOwners.${owner}`]: -1 },
            });
        }

        static async claimDelete(id: string) {
            await this.ensureOwner();
            return this.assets.findOneAndUpdate({ _id: id, state: 'ready', writers: 0 }, {
                $set: { state: 'deleting', deletingOwner: owner },
            });
        }

        static async unlockDelete(id: string) {
            await this.assets.updateOne({ _id: id, state: 'deleting', deletingOwner: owner }, {
                $set: { state: 'ready' }, $unset: { deletingOwner: '' },
            });
        }

        static async recoverAbandonedGates() {
            const gates = this.assets.find({ $or: [{ writers: { $gt: 0 } }, { state: 'deleting' }] });
            for await (const gate of gates) {
                const ids = new Set([...Object.keys(gate.writerOwners || {}), gate.deletingOwner].filter(Boolean));
                for (const id of ids) {
                    const record = await this.assets.findOne({ _id: `process:${id}` });
                    if (!isOwnerDead(record?.process, ownerProcess)) continue;
                    const count = gate.writerOwners?.[id];
                    if (count > 0) await this.assets.updateOne({ _id: gate._id, [`writerOwners.${id}`]: count }, {
                        $inc: { writers: -count }, $unset: { [`writerOwners.${id}`]: '' },
                    });
                    if (gate.deletingOwner === id) await this.assets.updateOne({ _id: gate._id, state: 'deleting', deletingOwner: id }, {
                        $set: { state: 'ready' }, $unset: { deletingOwner: '' },
                    });
                }
            }
        }

        static async uploadRemote(path: string, file: string | Buffer | Readable, contentType: string) {
            let asset: RemoteAsset;
            try {
                await this.ensureOwner();
                return await assetStorage.put(path, file, contentType, async (prepared) => {
                    await this.assets.insertOne({
                        _id: remoteIdentity(prepared), state: 'ready', writers: 1, writerOwners: { [owner]: 1 }, remoteAsset: prepared,
                    });
                    asset = prepared;
                });
            } catch (error) {
                if (asset) {
                    await this.releaseWriter(remoteIdentity(asset));
                    await this.collectRemote(asset).catch(() => undefined); // Failed cleanup remains in the registry for the hourly retry.
                }
                throw error;
            }
        }

        static async retire(ids: string[], operator = 1) {
            if (!ids.length) return;
            await this.coll.updateMany({ _id: { $in: ids }, autoDelete: null }, {
                $set: { autoDelete: moment().add(7, 'day').toDate() }, $push: { operator },
            });
        }

        static generateId(ext: string) {
            return `${nanoid(3).replace(/[_-]/g, '0')}/${nanoid().replace(/[_-]/g, '0')}${ext}`.toLowerCase();
        }

        static async put(path: string, file: string | Buffer | Readable, owner?: number) {
            const meta = {};
            const previous = await this.coll.find({ path, autoDelete: null }, { projection: { _id: 1 } }).toArray();
            meta['Content-Type'] = mime(path);
            let _id = StorageModel.generateId(extname(path));
            // Make sure id is not used
            // eslint-disable-next-line no-await-in-loop
            while (await StorageModel.coll.findOne({ _id })) _id = StorageModel.generateId(extname(path));
            if (assetStorage.shouldStore(path, meta['Content-Type'])) {
                const remoteAsset = await this.uploadRemote(path, file, meta['Content-Type']);
                try {
                    await this.coll.insertOne({
                        _id, meta, path, size: remoteAsset.size, etag: remoteAsset.sha256, remoteAsset, lastModified: new Date(), owner,
                    });
                    await this.retire(previous.map((item) => item._id));
                } finally {
                    await this.releaseWriter(remoteIdentity(remoteAsset));
                    await this.collectRemote(remoteAsset).catch(() => undefined);
                }
            } else {
                await storage.put(_id, file, meta);
                try {
                    const { metaData, size, etag } = await storage.getMeta(_id);
                    await this.coll.insertOne({ _id, meta: metaData, path, size, etag, lastModified: new Date(), owner });
                } catch (error) {
                    // A failed DB acknowledgement may still have inserted the record. Never delete referenced bytes.
                    if (!await this.coll.findOne({ _id })) await storage.del(_id);
                    throw error;
                }
                await this.retire(previous.map((item) => item._id));
            }
            return path;
        }

        static async get(path: string, savePath?: string) {
            const value = await StorageModel.coll.findOneAndUpdate(
                { path, autoDelete: null },
                { $set: { lastUsage: new Date() } },
                { returnDocument: 'after' },
            );
            if (value?.remoteAsset) return assetStorage.get(value.remoteAsset, savePath);
            return await storage.get(value?.link || value?._id || path, savePath);
        }

        static async rename(path: string, newPath: string, operator: null | number = 1) {
            return await StorageModel.coll.updateOne(
                { path, autoDelete: null },
                { $set: { path: newPath }, ...(operator !== null ? { $push: { operator } } : {}) },
            );
        }

        static async del(path: string[], operator = 1) {
            if (!path.length) return;
            const pendingDelete = await StorageModel.coll.find({ path: { $in: path }, autoDelete: null }).toArray();
            // Keep identities stable. GC checks every original/copy, including soft-deleted references.
            await this.retire(pendingDelete.map((item) => item._id), operator);
        }

        static async list(target: string, recursive = true) {
            if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
            if (target.length && !target.endsWith('/')) target += '/';
            const results = await StorageModel.coll.find({
                path: { $regex: `^${escapeRegExp(target)}${recursive ? '' : '[^/]+$'}` },
                autoDelete: null,
            }).toArray();
            return results.map((i) => ({
                ...i, name: i.path.split(target)[1],
            }));
        }

        static async getMeta(path: string) {
            const value = await StorageModel.coll.findOneAndUpdate(
                { path, autoDelete: null },
                { $set: { lastUsage: new Date() } },
                { returnDocument: 'after' },
            );
            if (!value) return null;
            return {
                ...value.meta,
                'Content-Type': typeof value.meta?.['Content-Type'] === 'string' ? value.meta['Content-Type'] : mime(value.path),
                size: value.size,
                lastModified: value.lastModified,
                etag: value.etag,
                ...(value.remoteAsset ? { remoteAsset: value.remoteAsset } : {}),
            };
        }

        static async signDownloadLink(target: string, filename?: string, noExpire = false, useAlternativeEndpointFor?: 'user' | 'judge') {
            const res = await StorageModel.coll.findOneAndUpdate(
                { path: target, autoDelete: null },
                { $set: { lastUsage: new Date() } },
            );
            if (res?.remoteAsset) return assetStorage.signDownloadLink(res.remoteAsset, filename);
            return await storage.signDownloadLink(res?.link || res?._id || target, filename, noExpire, useAlternativeEndpointFor);
        }

        static async move(src: string, dst: string) {
            const res = await StorageModel.coll.findOneAndUpdate(
                { path: src, autoDelete: null },
                { $set: { path: dst } },
            );
            return !!res;
        }

        static async exists(path: string) {
            const value = await StorageModel.coll.findOne({ path, autoDelete: null });
            return !!value;
        }

        static async copy(src: string, dst: string) {
            const value = await StorageModel.coll.findOneAndUpdate(
                { path: src, autoDelete: null },
                { $set: { lastUsage: new Date() } },
                { returnDocument: 'after' },
            );
            if (!value) throw new Error(`Original file ${src} not found`);
            const gate = await this.acquireWriter(value);
            try {
                const current = await this.coll.findOne({ _id: value._id, path: src, autoDelete: null });
                if (!current || physicalIdentity(current) !== gate) throw new Error('Original file changed; retry the copy');
                const previous = await this.coll.find({ path: dst, autoDelete: null }, { projection: { _id: 1 } }).toArray();
                let _id = StorageModel.generateId(extname(dst));
                // eslint-disable-next-line no-await-in-loop
                while (await StorageModel.coll.findOne({ _id })) _id = StorageModel.generateId(extname(dst));
                const copied = { ...current, _id, path: dst, lastModified: new Date(), owner: current.owner || 1 };
                if (current.remoteAsset) delete copied.link;
                else copied.link = current.link || current._id;
                await this.coll.insertOne(copied);
                await this.retire(previous.map((item) => item._id));
                return _id;
            } finally {
                await this.releaseWriter(gate);
            }
        }

        /** Migrate exactly one storage record, including retained historical versions. Never resolve by path here. */
        static async migrateToRemote(recordId: string) {
            const initial = await this.coll.findOne({ _id: recordId });
            if (!initial) return { status: 'skipped' as const };
            if (initial.remoteAsset) return { status: 'remote' as const, remoteAsset: initial.remoteAsset, physicalId: initial.localMirrorId };
            const physicalId = initial.link || initial._id;
            const contentType = `${initial.meta?.['Content-Type'] || mime(initial.path)}`;
            if (!eligibleAsset(initial.path, contentType) || !assetStorage.shouldStore(initial.path, contentType)) {
                return { status: 'skipped' as const, physicalId };
            }
            const gate = await this.acquireWriter(initial);
            let remoteAsset: RemoteAsset;
            try {
                const current = await this.coll.findOne({ _id: recordId });
                if (!current || current.remoteAsset || physicalIdentity(current) !== gate || current.path !== initial.path) {
                    throw new Error('File changed during migration; retry');
                }
                remoteAsset = await this.uploadRemote(current.path, await storage.get(physicalId), contentType);
                const result = await this.coll.updateOne({
                    _id: recordId, path: current.path, remoteAsset: { $exists: false }, link: current.link || null,
                    size: current.size ?? null, etag: current.etag ?? null, lastModified: current.lastModified ?? null,
                }, {
                    $set: { remoteAsset, localMirrorId: physicalId, size: remoteAsset.size, etag: remoteAsset.sha256 }, $unset: { link: '' },
                });
                if (!result.matchedCount) throw new Error('File changed during migration; retry');
                return { status: 'migrated' as const, remoteAsset, physicalId };
            } finally {
                if (remoteAsset) {
                    await this.releaseWriter(remoteIdentity(remoteAsset));
                    await this.collectRemote(remoteAsset).catch(() => undefined);
                }
                await this.releaseWriter(gate);
            }
        }

        /** Separate migration cleanup: no bytes are unlinked until every local alias is gone. */
        static async cleanupLocalMirror(physicalId: string) {
            if (!/^[a-z0-9]+\/[a-z0-9]+\.[a-z0-9]+$/.test(physicalId)) throw new Error('Invalid local storage identity');
            const id = `local:${physicalId}`;
            await this.initializeGate(id);
            const gate = await this.claimDelete(id);
            if (!gate) {
                if (await this.assets.findOne({ _id: id, state: 'deleted' }) && !await this.coll.findOne(localQuery(physicalId))) {
                    await this.coll.updateMany({ localMirrorId: physicalId }, { $unset: { localMirrorId: '' } });
                    return true;
                }
                return false;
            }
            try {
                if (await this.coll.findOne(localQuery(physicalId))) return false;
                // Cleanup can run long after upload; verify the remote primary still exists before discarding its local backup.
                for await (const file of this.coll.find({ localMirrorId: physicalId })) {
                    if (!file.remoteAsset) return false;
                    await assetStorage.verify(file.remoteAsset);
                }
                await storage.del(physicalId);
                await this.assets.updateOne({ _id: id }, { $set: { state: 'deleted' } });
                await this.coll.updateMany({ localMirrorId: physicalId }, { $unset: { localMirrorId: '' } });
                return true;
            } finally {
                await this.unlockDelete(id);
            }
        }

        static async collectRemote(asset: RemoteAsset) {
            const id = remoteIdentity(asset);
            // Ordinary successful writes never take a deletion lock on a live object.
            if (await this.coll.findOne(remoteQuery(asset))) return false;
            const gate = await this.claimDelete(id);
            if (!gate) return false;
            try {
                if (await this.coll.findOne(remoteQuery(asset))) return false;
                await assetStorage.delete(asset);
                await this.assets.updateOne({ _id: id }, { $set: { state: 'deleted' } });
                return true;
            } finally {
                // A failed network deletion keeps the descriptor for another hourly attempt.
                await this.unlockDelete(id);
            }
        }

        static async cleanFiles() {
            await this.recoverAbandonedGates();
            const expired = this.coll.find({ autoDelete: { $lte: new Date() } });
            for await (const file of expired) {
                const id = physicalIdentity(file);
                if (!file.remoteAsset) await this.initializeGate(id);
                const gate = await this.claimDelete(id);
                if (!gate) continue;
                try {
                    const current = await this.coll.findOne({ _id: file._id, autoDelete: { $lte: new Date() } });
                    if (!current || physicalIdentity(current) !== id) continue;
                    const others = await this.coll.findOne({
                        ...(file.remoteAsset ? remoteQuery(file.remoteAsset) : localQuery(file.link || file._id)), _id: { $ne: file._id },
                    });
                    if (!others) {
                        if (file.remoteAsset) await assetStorage.delete(file.remoteAsset);
                        else await storage.del(file.link || file._id);
                    }
                    await this.coll.deleteOne({ _id: file._id, autoDelete: { $lte: new Date() } });
                    if (!others) await this.assets.updateOne({ _id: id }, { $set: { state: 'deleted' } });
                } finally {
                    await this.unlockDelete(id);
                }
            }
            for await (const gate of this.assets.find({ state: 'ready', writers: 0, remoteAsset: { $exists: true } })) {
                await this.collectRemote(gate.remoteAsset);
            }
        }
    };
}
