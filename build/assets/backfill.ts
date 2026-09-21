/* eslint-disable no-await-in-loop */
// Data-only migration orchestration. This module never bootstraps Hydro, builds UI, or installs packages.
import {
    closeSync, constants, createReadStream, existsSync, fchmodSync, fsyncSync, lstatSync,
    mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeSync,
} from 'fs';
import { rm } from 'fs/promises';
import { dirname, isAbsolute, resolve } from 'path';
import { createInterface } from 'readline';
import type { FileNode } from '../../packages/hydrooj/src/interface';
import type { AssetReferenceGate } from '../../packages/hydrooj/src/lib/asset_storage_model';

interface RecordDoc {
    _id: string;
    path: string;
    link?: string;
    size?: number;
    meta?: Record<string, any>;
    remoteAsset?: Record<string, any>;
    [key: string]: any;
}
interface Dependencies {
    storage: {
        coll: { find(query: any): { sort(value: any): { limit(count: number): AsyncIterable<RecordDoc> } } };
        migrateToRemote(recordId: string): Promise<{ status: 'migrated' | 'remote' | 'skipped'; remoteAsset?: any; physicalId?: string }>;
        cleanupLocalMirror(physicalId: string): Promise<boolean>;
        recoverAbandonedGates?(): Promise<unknown>;
    };
    eligibleAsset(path: string, contentType: string): boolean;
}
export interface BackfillOptions {
    /** Defaults to false; dry-run does not upload, mutate the database, or write any files. */
    apply?: boolean;
    /** Separate opt-in, and only meaningful with apply. All aliases must first be remote. */
    cleanup?: boolean;
    /** Cleanup pass never uploads additional local records. */
    cleanupOnly?: boolean;
    /** Private, absolute JSONL journal path, required when applying. */
    manifestPath?: string;
    /** Bound each invocation; nextId is a stable cursor for the next batch. */
    limit?: number;
    afterId?: string;
}

async function runtimeDependencies(): Promise<Dependencies> {
    const storage = global.Hydro?.model?.storage;
    if (!storage?.migrateToRemote || !storage?.cleanupLocalMirror) {
        throw new Error('Asset backfill requires an initialized storage model or explicit data-only dependencies');
    }
    const { eligibleAsset } = require('../../packages/hydrooj/src/lib/asset_storage') as typeof import('../../packages/hydrooj/src/lib/asset_storage');
    return { storage, eligibleAsset };
}

/** Reuses the model's CAS + writer/GC gates; never edits storage records directly. */
export async function run(options: BackfillOptions = {}, dependencies?: Dependencies) {
    const limit = options.limit ?? 500;
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new Error('Backfill limit must be between 1 and 10000');
    if (options.afterId !== undefined && (typeof options.afterId !== 'string' || options.afterId.length > 300)) throw new Error('Invalid backfill cursor');
    if (options.apply && (!options.manifestPath || !isAbsolute(options.manifestPath))) throw new Error('Apply requires an absolute private journal path');
    if (options.cleanup && !options.apply) throw new Error('Cleanup also requires apply');
    const { storage, eligibleAsset } = dependencies || await runtimeDependencies();
    const summary = { dryRun: !options.apply, scanned: 0, candidates: 0, bytes: 0, migrated: 0, alreadyRemote: 0,
        skipped: 0, localDeleted: 0, localRetained: 0, nextId: options.afterId || '', hasMore: false };
    let journal: number;
    let lock: string;
    const log = (entry: Record<string, any>) => {
        if (journal === undefined) return;
        writeSync(journal, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
        // Persist the old descriptor and new verified descriptor before any irreversible local unlink.
        fsyncSync(journal);
    };
    try {
        const previousPhysicalIds = new Set<string>();
        if (options.apply) {
            mkdirSync(dirname(options.manifestPath), { recursive: true, mode: 0o700 });
            const lockPath = `${options.manifestPath}.lock`;
            const lockHandle = openSync(lockPath, 'wx', 0o600);
            lock = lockPath;
            try { writeSync(lockHandle, `${process.pid}\n`); fsyncSync(lockHandle); } finally { closeSync(lockHandle); }
            if (options.cleanupOnly && existsSync(options.manifestPath)) {
                // Migration unsets old link aliases in Mongo. The durable apply journal retains their physical identities.
                if (!lstatSync(options.manifestPath).isFile()) throw new Error('Cleanup journal must be a regular file');
                const lines = createInterface({ input: createReadStream(options.manifestPath), crlfDelay: Infinity });
                for await (const line of lines) {
                    if (!line.trim()) continue;
                    const entry = JSON.parse(line);
                    if (entry.event === 'after' && ['migrated', 'remote'].includes(entry.result?.status)
                        && typeof entry.physicalId === 'string') previousPhysicalIds.add(entry.physicalId);
                }
            }
            journal = openSync(options.manifestPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
            fchmodSync(journal, 0o600);
            log({ event: 'begin', cleanup: !!options.cleanup, afterId: options.afterId || '', limit });
            // Recover only registry owners proven dead by the model; dry-run remains read-only.
            await storage.recoverAbandonedGates?.();
        }
        const physicalIds = previousPhysicalIds;
        const query = options.afterId ? { _id: { $gt: options.afterId } } : {};
        for await (const record of storage.coll.find(query).sort({ _id: 1 }).limit(limit + 1)) {
            if (summary.scanned === limit) { summary.hasMore = true; break; }
            summary.scanned++;
            summary.nextId = record._id;
            if (!eligibleAsset(record.path, record.meta?.['Content-Type'] || '')) { summary.skipped++; continue; }
            summary.candidates++;
            summary.bytes += record.remoteAsset ? 0 : (record.size || 0);
            if (!options.apply) {
                if (record.remoteAsset) summary.alreadyRemote++;
                continue;
            }
            if (options.cleanupOnly && !record.remoteAsset) { summary.skipped++; continue; }
            const physicalId = record.localMirrorId || record.link || record._id;
            log({ event: 'before', recordId: record._id, physicalId, record });
            const result = await storage.migrateToRemote(record._id);
            if (result.status === 'migrated') {
                if (!result.remoteAsset) throw new Error('Migration returned no verified object descriptor');
                summary.migrated++;
            } else if (result.status === 'remote') summary.alreadyRemote++;
            else summary.skipped++;
            log({ event: 'after', recordId: record._id, physicalId: result.physicalId || physicalId, result });
            if (result.status === 'migrated' || (result.status === 'remote' && (result.physicalId || record.localMirrorId))) {
                physicalIds.add(result.physicalId || physicalId);
            }
        }
        if (options.cleanup) {
            // The model checks every _id/link reference, including soft-deleted records still in retention.
            // A skipped, ineligible, concurrently copied, or later-batch alias prevents local deletion.
            for (const physicalId of physicalIds) {
                log({ event: 'local-cleanup-intent', physicalId });
                const removed = await storage.cleanupLocalMirror(physicalId);
                if (removed) summary.localDeleted++;
                else summary.localRetained++;
                log({ event: 'local-cleanup-result', physicalId, removed });
            }
        }
        log({ event: 'complete', summary });
        return summary;
    } catch {
        try { log({ event: 'failed', summary }); } catch { /* Preserve the original failure without leaking SDK credentials. */ }
        throw new Error('Asset backfill stopped; no further local cleanup was performed. Inspect the private migration journal.');
    } finally {
        if (journal !== undefined) closeSync(journal);
        if (lock && existsSync(lock)) unlinkSync(lock);
    }
}

/** Standalone bootstrap: Mongo + local file adapter + pure storage factory, with no Hydro/app/UI initialization. */
export async function main(args = process.argv.slice(2)) {
    if (args.includes('--help')) {
        console.log('Usage: node -r @hydrooj/register build/assets/backfill.ts --database-config <absolute private config.json> --storage-root <absolute file root> [--asset-config <absolute assets.json>] [--apply | --cleanup] [--manifest <absolute private journal.jsonl>] [--limit 500] [--after-id <cursor>]');
        console.log('Default: read-only dry-run. Apply uploads and records verified primary objects. Cleanup reads the apply journal, then removes local files only after every alias is remote. No app startup, build, package installation, or automatic rollback.');
        return;
    }
    const values: Record<string, string> = {};
    let mode = 'dry-run';
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--apply' || arg === '--cleanup') {
            if (mode !== 'dry-run') throw new Error('Choose one migration stage');
            mode = arg.slice(2); continue;
        }
        if (!['--database-config', '--storage-root', '--asset-config', '--manifest', '--limit', '--after-id'].includes(arg)
            || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Invalid migration arguments');
        values[arg.slice(2)] = args[++index];
    }
    if (!isAbsolute(values['database-config'] || '') || !isAbsolute(values['storage-root'] || '')
        || (values['asset-config'] && !isAbsolute(values['asset-config']))) throw new Error('Configuration and local storage paths must be absolute');
    const localRoot = realpathSync(values['storage-root']);
    if (!lstatSync(localRoot).isDirectory()) throw new Error('Local storage root must be a directory');
    const config = JSON.parse(readFileSync(values['database-config'], 'utf8'));
    const uri = config.url || config.uri || `${config.protocol || 'mongodb'}://${config.username
        ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password || '')}@` : ''}${config.host || '127.0.0.1'}:${config.port || 27017}/${config.name || 'hydro'}`;
    // @hydrooj/register installs CommonJS TypeScript hooks; native import() bypasses them.
    const { MongoClient } = require('mongodb') as typeof import('mongodb');
    const { AssetStorage, eligibleAsset } = require('../../packages/hydrooj/src/lib/asset_storage') as typeof import('../../packages/hydrooj/src/lib/asset_storage');
    const { createAssetStorageModel } = require('../../packages/hydrooj/src/lib/asset_storage_model') as typeof import('../../packages/hydrooj/src/lib/asset_storage_model');
    const connection = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    const assetStorage = new AssetStorage({ configPath: values['asset-config'] });
    if (mode === 'apply' && !assetStorage.shouldStore('scratch/probe/000000000000000000000000.sb3', 'application/octet-stream')) {
        throw new Error('Enable OSS primary storage before applying migration');
    }
    const localFile = (id: string) => {
        if (!/^[a-z0-9]+\/[a-z0-9]+\.[a-z0-9]+$/.test(id)) throw new Error('Invalid local storage identity');
        const target = resolve(localRoot, id);
        if (!realpathSync(dirname(target)).startsWith(`${localRoot}/`)) throw new Error('Local file escaped the configured root');
        if (existsSync(target) && (!lstatSync(target).isFile() || !realpathSync(target).startsWith(`${localRoot}/`))) {
            throw new Error('Local storage source must be a regular file within the configured root');
        }
        return target;
    };
    const unsupported = async (): Promise<never> => { throw new Error('Unsupported migration adapter operation'); };
    try {
        await connection.connect();
        const db = connection.db(require('mongodb-uri').parse(uri).database || config.name || 'hydro');
        const collectionName = (name: string) => {
            const full = config.prefix ? `${config.prefix}.${name}` : name;
            return config.collectionMap?.[full] || full;
        };
        const storage = createAssetStorageModel({
            coll: db.collection<FileNode>(collectionName('storage')),
            assets: db.collection<AssetReferenceGate>(collectionName('storage.asset')),
            assetStorage,
            storage: {
                get: async (id: string) => createReadStream(localFile(id)),
                del: async (id: string) => rm(localFile(id), { force: true }),
                put: unsupported, getMeta: unsupported, signDownloadLink: unsupported,
            },
        });
        const summary = await run({
            apply: mode !== 'dry-run', cleanup: mode === 'cleanup', cleanupOnly: mode === 'cleanup',
            manifestPath: values.manifest, limit: values.limit ? Number(values.limit) : undefined, afterId: values['after-id'],
        }, { storage, eligibleAsset });
        console.log(JSON.stringify(summary));
        return summary;
    } finally { await connection.close(); }
}

if (require.main === module) {
    main().catch(() => {
        console.error('Asset migration stopped. Check the private configuration, prepared storage service, and journal; credentials and connection details are not printed.');
        process.exitCode = 1;
    });
}
