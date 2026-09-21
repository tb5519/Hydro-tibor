import { createHash, randomBytes } from 'crypto';
import { createReadStream, createWriteStream, readFileSync, statSync } from 'fs';
import { lstat, mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { homedir, hostname, tmpdir } from 'os';
import { extname, isAbsolute, join } from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import {
    DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { RemoteAsset } from '../interface';

interface AssetStorageConfig {
    storageEnabled?: boolean;
    bucket: string;
    region: string;
    endpoint: string;
    /** Optional same-region OSS internal S3 origin, used only by the server. */
    internalEndpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}

interface Options {
    configPath?: string;
    client?: (config: AssetStorageConfig) => Pick<S3Client, 'send'>;
    sign?: typeof getSignedUrl;
    timeoutMs?: number;
    maxBytes?: number;
    concurrency?: number;
    queueLimit?: number;
    temporaryRoot?: string;
    ownerProcess?: AssetProcessIdentity;
    isOwnerDead?: typeof provenAssetProcessDead;
}

export interface AssetProcessIdentity { host: string; boot: string; pid: number; start: string }

function processStart(pid: number) {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
}

export function assetProcessIdentity(): AssetProcessIdentity {
    try {
        return { host: hostname(), boot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(), pid: process.pid, start: processStart(process.pid) };
    } catch { return null; } // Never guess process liveness on other platforms.
}

/** No age-based lock stealing: Linux PID/start-time identity must prove the previous process has exited. */
export function provenAssetProcessDead(owner: AssetProcessIdentity, current: AssetProcessIdentity) {
    if (!owner || !current || owner.host !== current.host || owner.boot !== current.boot || !Number.isSafeInteger(owner.pid)) return false;
    try { return processStart(owner.pid) !== owner.start; } catch (error) { return error.code === 'ENOENT'; }
}

const TYPES: Record<string, string[]> = {
    '.png': ['image/png'], '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.gif': ['image/gif'],
    '.webp': ['image/webp'], '.avif': ['image/avif'], '.svg': ['image/svg+xml'], '.ico': ['image/x-icon', 'image/vnd.microsoft.icon'],
    '.mp3': ['audio/mpeg'], '.ogg': ['audio/ogg'], '.wav': ['audio/wav', 'audio/wave', 'audio/x-wav'], '.m4a': ['audio/mp4', 'audio/x-m4a'],
};

/** This is deliberately a business-path allowlist, never a global replacement for Judge storage. */
export function eligibleAsset(path: string, contentType: string) {
    if (typeof path !== 'string' || /[\\\u0000-\u001f?#%]/.test(path)
        || path.split('/').some((part) => !part || part === '.' || part === '..')) return false;
    const ext = extname(path).toLowerCase();
    if (ext === '.sb3') return /^scratch\/[^/]+\/[a-f0-9]{24}\.sb3$/.test(path)
        && ['application/octet-stream', 'application/x.scratch.sb3'].includes(contentType);
    if (!TYPES[ext]?.includes(contentType)) return false;
    return /^scratch\/[^/]+\/[a-f0-9]{24}\.[a-z0-9]+$/.test(path)
        || /^user\/\d+\/[^/]+$/.test(path)
        || /^domain\/[^/]+\/avatar-[a-f0-9-]{36}\.png$/.test(path)
        || /^domain\/[^/]+\/home-poster-\d+\.[a-z0-9]+$/.test(path)
        || /^(?:domain\/[^/]+\/)?badge\/[^/]+\/(profile-background|ac-effect|theme-sound)-\d+\.[a-z0-9]+$/.test(path)
        || /^(?:domain\/[^/]+|system)\/point-lottery\/lottery-prize-[a-z0-9-]+\.[a-z0-9]+$/.test(path)
        || /^training\/[^/]+\/[^/]+\/[^/]+$/.test(path)
        || /^problem\/[^/]+\/[^/]+\/additional_file\/[^/]+$/.test(path)
        || /^contest\/[^/]+\/[^/]+\/public\/[^/]+$/.test(path);
}

export function validRemoteAsset(asset: RemoteAsset) {
    return asset && /^media\/v1\/[a-f0-9]{64}\.(png|jpe?g|gif|webp|avif|svg|ico|mp3|ogg|wav|m4a|sb3)$/.test(asset.key)
        && /^[a-f0-9]{64}$/.test(asset.sha256) && Number.isSafeInteger(asset.size) && asset.size > 0
        && typeof asset.contentType === 'string' && typeof asset.bucket === 'string' && typeof asset.region === 'string';
}

/** Optional primary storage for selected media. Read access never depends on CDN/write switches. */
export class AssetStorage {
    private readonly configPath: string;
    private clients = new Map<string, Pick<S3Client, 'send'>>();
    private clientConfig = '';
    private activeUploads = 0;
    private uploadQueue: (() => void)[] = [];
    private reap: Promise<void>;

    constructor(private options: Options = {}) {
        const configured = options.configPath ?? process.env.HYDRO_ASSET_CONFIG_PATH;
        this.configPath = configured ? (isAbsolute(configured) ? configured : '') : join(homedir(), '.hydro/assets.json');
    }

    private async acquireUpload() {
        if (this.activeUploads < (this.options.concurrency ?? 2)) {
            this.activeUploads++;
            return;
        }
        if (this.uploadQueue.length >= (this.options.queueLimit ?? 8)) throw new Error('Media uploads are busy; please retry');
        await new Promise<void>((resolve) => this.uploadQueue.push(resolve));
    }

    private releaseUpload() {
        const next = this.uploadQueue.shift();
        if (next) next();
        else this.activeUploads--;
    }

    async reapTemporaryUploads() {
        const directory = this.options.temporaryRoot || tmpdir();
        const current = this.options.ownerProcess || assetProcessIdentity();
        const isDead = this.options.isOwnerDead || provenAssetProcessDead;
        for (const name of await readdir(directory)) {
            if (!/^hydro-asset-[a-zA-Z0-9]+$/.test(name)) continue;
            const target = join(directory, name);
            try {
                if (!(await lstat(target)).isDirectory() || (await lstat(join(target, 'owner.json'))).size > 1024) continue;
                const owner = JSON.parse(await readFile(join(target, 'owner.json'), 'utf8'));
                if (isDead(owner, current)) await rm(target, { recursive: true, force: true });
            } catch { /* Unknown owners remain available for a deliberate operator audit. */ }
        }
    }

    private config(required = false): AssetStorageConfig | null {
        let value: AssetStorageConfig;
        try {
            if (!this.configPath || statSync(this.configPath).size > 32_768) throw new Error();
            value = JSON.parse(readFileSync(this.configPath, 'utf8'));
        } catch {
            if (required) throw new Error('OSS primary storage configuration is unavailable');
            return null;
        }
        try {
            const endpoint = new URL(value.endpoint);
            if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/' || endpoint.username || endpoint.password
                || endpoint.search || endpoint.hash || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value.bucket)
                || !/^[a-z0-9-]+$/.test(value.region) || !value.accessKeyId || !value.secretAccessKey) throw new Error();
            if (value.internalEndpoint !== undefined) {
                const internal = new URL(value.internalEndpoint);
                const expected = `https://s3.oss-${value.region}-internal.aliyuncs.com`;
                if (internal.origin !== expected || internal.pathname !== '/' || internal.username || internal.password
                    || internal.search || internal.hash || ![expected, `${expected}/`].includes(value.internalEndpoint)) throw new Error();
            }
        } catch {
            if (required || value?.storageEnabled === true) throw new Error('OSS primary storage configuration is invalid');
            return null;
        }
        return value;
    }

    shouldStore(path: string, contentType: string) {
        return eligibleAsset(path, contentType) && this.config()?.storageEnabled === true;
    }

    private client(config: AssetStorageConfig, publicEndpoint = false) {
        const endpoint = publicEndpoint ? config.endpoint : (config.internalEndpoint || config.endpoint);
        if (this.options.client) return this.options.client({ ...config, endpoint });
        const revision = JSON.stringify(config);
        if (revision !== this.clientConfig) {
            this.clients.clear();
            this.clientConfig = revision;
        }
        if (!this.clients.has(endpoint)) {
            this.clients.set(endpoint, new S3Client({
                region: config.region, endpoint, forcePathStyle: false,
                requestChecksumCalculation: 'WHEN_REQUIRED',
                credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, sessionToken: config.sessionToken },
            }));
        }
        return this.clients.get(endpoint);
    }

    private connection(asset: RemoteAsset, publicEndpoint = false) {
        const config = this.config(true);
        if (!validRemoteAsset(asset) || config.bucket !== asset.bucket || config.region !== asset.region) {
            throw new Error('OSS primary storage object does not match the configured bucket and region');
        }
        return this.client(config, publicEndpoint);
    }

    /** onPrepared records an object in the GC registry before it can reach OSS. */
    async put(path: string, file: string | Buffer | Readable, contentType: string, onPrepared?: (asset: RemoteAsset) => Promise<void>) {
        let acquired = false;
        try {
            await this.acquireUpload();
            acquired = true;
            this.reap ||= this.reapTemporaryUploads().catch(() => undefined);
            await this.reap;
            return await this.putUnlocked(path, file, contentType, onPrepared);
        } finally {
            if (typeof file !== 'string' && !Buffer.isBuffer(file)) file.destroy();
            if (acquired) this.releaseUpload();
        }
    }

    private async putUnlocked(path: string, file: string | Buffer | Readable, contentType: string, onPrepared?: (asset: RemoteAsset) => Promise<void>) {
        const config = this.config(true);
        if (!config.storageEnabled || !eligibleAsset(path, contentType)) throw new Error('File is not enabled for OSS primary storage');
        const maxBytes = Math.min(this.options.maxBytes ?? 512 * 1024 * 1024, path.endsWith('.sb3') ? 20 * 1024 * 1024 : Infinity);
        const hash = createHash('sha256');
        const md5 = createHash('md5');
        let size = 0;
        let temporary: string;
        let source: string | Buffer = typeof file === 'string' || Buffer.isBuffer(file) ? file : null;
        let body: Readable;
        const measure = (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) throw new Error('Media file exceeds the OSS primary storage size limit');
            hash.update(chunk);
            md5.update(chunk);
        };
        try {
            if (Buffer.isBuffer(file)) measure(file);
            else if (typeof file === 'string') {
                for await (const chunk of createReadStream(file)) measure(chunk as Buffer);
            } else {
                // A bounded temporary spool makes streams retryable and hashes bytes without retaining a second in-memory copy.
                temporary = await mkdtemp(join(this.options.temporaryRoot || tmpdir(), 'hydro-asset-'));
                await writeFile(join(temporary, 'owner.json'), JSON.stringify(this.options.ownerProcess || assetProcessIdentity()), { mode: 0o600 });
                source = join(temporary, 'upload');
                await pipeline(file, new Transform({
                    transform(chunk, encoding, callback) {
                        try { measure(chunk); callback(null, chunk); } catch (error) { callback(error); }
                    },
                }), createWriteStream(source));
            }
            if (!size) throw new Error('Empty media files cannot use OSS primary storage');
            const remote: RemoteAsset = {
                key: `media/v1/${randomBytes(32).toString('hex')}${extname(path).toLowerCase()}`,
                sha256: hash.digest('hex'), size, contentType, bucket: config.bucket, region: config.region,
            };
            await onPrepared?.(remote);
            const client = this.client(config);
            const input = typeof source === 'string' ? (body = createReadStream(source)) : source;
            await client.send(new PutObjectCommand({
                Bucket: remote.bucket, Key: remote.key, Body: input, ContentLength: size,
                ContentType: contentType, ContentMD5: md5.digest('base64'), Metadata: { sha256: remote.sha256 },
                ...(path.endsWith('.sb3') ? { ContentDisposition: 'attachment' } : {}),
                CacheControl: 'private, max-age=0',
            }), { abortSignal: AbortSignal.timeout(this.options.timeoutMs ?? 300_000) });
            await this.verify(remote);
            return remote;
        } finally {
            body?.destroy();
            if (temporary) await rm(temporary, { recursive: true, force: true });
        }
    }

    async verify(asset: RemoteAsset) {
        const head = await this.connection(asset).send(new HeadObjectCommand({ Bucket: asset.bucket, Key: asset.key }), {
            abortSignal: AbortSignal.timeout(this.options.timeoutMs ?? 300_000),
        });
        if (head.ContentLength !== asset.size || head.Metadata?.sha256 !== asset.sha256 || head.ContentType !== asset.contentType) {
            throw new Error('OSS primary storage upload verification failed');
        }
    }

    async get(asset: RemoteAsset, savePath?: string) {
        const result = await this.connection(asset).send(new GetObjectCommand({ Bucket: asset.bucket, Key: asset.key }), {
            abortSignal: AbortSignal.timeout(this.options.timeoutMs ?? 300_000),
        });
        if (!result.Body || typeof (result.Body as Readable).pipe !== 'function') throw new Error('OSS primary storage returned no stream');
        const body = result.Body as Readable;
        if (!savePath) return body;
        try { await pipeline(body, createWriteStream(savePath)); } catch (error) {
            await rm(savePath, { force: true });
            throw error;
        }
        return null;
    }

    async signDownloadLink(asset: RemoteAsset, filename?: string) {
        const escaped = filename ? encodeURIComponent(filename).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`) : '';
        return (this.options.sign || getSignedUrl)(this.connection(asset, true) as S3Client, new GetObjectCommand({
            Bucket: asset.bucket, Key: asset.key,
            ...(filename ? { ResponseContentDisposition: `attachment; filename="${escaped}"; filename*=UTF-8''${escaped}` } : {}),
        }), { expiresIn: 600 });
    }

    async delete(asset: RemoteAsset) {
        await this.connection(asset).send(new DeleteObjectCommand({ Bucket: asset.bucket, Key: asset.key }), {
            abortSignal: AbortSignal.timeout(this.options.timeoutMs ?? 300_000),
        });
    }
}

export default new AssetStorage();
