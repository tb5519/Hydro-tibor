import { createHash, randomBytes } from 'crypto';
import {
    existsSync, lstatSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import type { Readable } from 'stream';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

interface AssetConfig {
    enabled: boolean;
    publicBaseUrl?: string;
    mediaBaseUrl?: string;
    mediaSigningKey?: string;
    bucket?: string;
    region?: string;
    endpoint?: string;
    /** Optional same-region internal S3 origin for server-side mirror traffic only. */
    internalEndpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
}

export interface AssetSource {
    path: string;
    meta: {
        size: number;
        etag?: string;
        lastModified?: Date | string;
        'Content-Type'?: string;
        /** Server-owned storage metadata only; never accept this descriptor from request input. */
        remoteAsset?: { key: string; sha256: string; size: number; contentType: string; bucket: string; region: string };
    };
    load?: () => Buffer | Readable | Promise<Buffer | Readable>;
    /** Include the transformation revision and dimensions for generated previews. */
    variant?: string;
    contentDisposition?: string;
    /** Only handler-selected decorative images; never request-controlled. */
    decoration?: 'home-poster' | 'badge';
}

interface Mirror { key: string; size: number; sha256: string }
interface Job { id: string; source: AssetSource; config: AssetConfig; key: string; scope: string }
interface Options {
    configPath?: string;
    publicRoot?: string;
    now?: () => number;
    client?: (config: AssetConfig) => Pick<S3Client, 'send'>;
    load?: (path: string) => Promise<Buffer | Readable>;
    queueLimit?: number;
    timeoutMs?: number;
    retryMs?: number;
    maxBytes?: number;
}

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const PUBLIC_EXTRAS = [
    'favicon.ico', 'favicon.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-96x96.png',
    'apple-touch-icon-180x180.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png',
    'img/avatar.png', 'img/team_avatar.png',
];
const MEDIA_TYPES: Record<string, string> = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
    'image/avif': '.avif', 'image/svg+xml': '.svg', 'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav',
    'audio/wave': '.wav', 'audio/x-wav': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a',
};

function safePath(value: string) {
    return typeof value === 'string' && value && !value.startsWith('/') && !/[\\\u0000-\u001f?#]/.test(value)
        && value.split('/').every((part) => part && part !== '.' && part !== '..');
}

function httpsUrl(value: unknown) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url : null;
    } catch { return null; }
}

/** CDN Type A, distinct from the S3 V4 signature used to upload objects.
 * https://help.aliyun.com/zh/cdn/user-guide/type-a-signing
 * Configure the matching CDN validity to 1800 seconds; the timestamp is issue time.
 */
export function signMediaUrl(base: string, key: string, secret: string, now = Date.now()) {
    const url = new URL(key, base);
    const timestamp = Math.floor(now / 1000);
    const nonce = randomBytes(16).toString('hex');
    const signature = createHash('md5').update(`${url.pathname}-${timestamp}-${nonce}-0-${secret}`).digest('hex');
    url.searchParams.set('auth_key', `${timestamp}-${nonce}-0-${signature}`);
    return url.toString();
}

/** Small, optional delivery layer. It never changes the primary storage provider or permissions. */
export class AssetDelivery {
    private readonly configPath: string;
    private readonly indexPath: string;
    private readonly publicRoot: string;
    private config: AssetConfig | null = null;
    private configChecked = -Infinity;
    private allowed: Set<string>;
    private backgroundVersions = new Map<string, string>();
    private mirrors = new Map<string, Mirror>();
    private pending = new Set<string>();
    private failed = new Map<string, number>();
    private queue: Job[] = [];
    private active = false;
    private idle: (() => void)[] = [];
    private loadedIndex = false;
    private clients = new Map<string, Pick<S3Client, 'send'>>();
    private now: () => number;

    constructor(private options: Options = {}) {
        const configured = options.configPath ?? process.env.HYDRO_ASSET_CONFIG_PATH;
        // A relative override is invalid, rather than accidentally reading a checkout file.
        this.configPath = configured ? (isAbsolute(configured) ? configured : '') : join(homedir(), '.hydro/assets.json');
        this.indexPath = this.configPath ? join(dirname(this.configPath), 'asset-mirror-index.json') : '';
        this.publicRoot = options.publicRoot || resolve(__dirname, '../../../ui-default/public');
        this.now = options.now || Date.now;
    }

    private readConfig() {
        if (this.now() - this.configChecked < 30_000) return this.config;
        this.configChecked = this.now();
        this.config = null;
        try {
            if (!this.configPath || statSync(this.configPath).size > 32_768) return null;
            const value = JSON.parse(readFileSync(this.configPath, 'utf8'));
            if (value?.enabled !== true) return null;
            if (value.internalEndpoint !== undefined) {
                const internal = httpsUrl(value.internalEndpoint);
                const expected = `https://s3.oss-${value.region}-internal.aliyuncs.com`;
                if (!internal || internal.origin !== expected || internal.pathname !== '/'
                    || ![expected, `${expected}/`].includes(value.internalEndpoint)) return null;
            }
            this.config = value;
        } catch { /* Missing or invalid optional config leaves all origin behavior intact. */ }
        return this.config;
    }

    private allowedPaths() {
        if (this.allowed) return this.allowed;
        this.allowed = new Set();
        const add = (value: unknown) => {
            if (typeof value !== 'string') return;
            try {
                const relative = decodeURIComponent(value.split(/[?#]/, 1)[0]).replace(/^\//, '');
                const target = join(this.publicRoot, relative);
                if (safePath(relative) && !relative.endsWith('.map') && existsSync(target) && lstatSync(target).isFile()
                    && realpathSync(target).startsWith(`${realpathSync(this.publicRoot)}/`)) {
                    this.allowed.add(relative);
                    if (/^components\/profile\/backgrounds\/(?:thumbnail\/)?\d+\.jpg$/.test(relative)) {
                        this.backgroundVersions.set(relative, value.match(/\?[^#]*/)?.[0] || '');
                    }
                }
            } catch { /* Invalid manifest entries are never mapped. */ }
        };
        try { Object.values(JSON.parse(readFileSync(join(this.publicRoot, 'manifest.json'), 'utf8'))).forEach(add); } catch { /* Optional. */ }
        try {
            const manifest = JSON.parse(readFileSync(join(this.publicRoot, 'scratch-editor/build-manifest.json'), 'utf8'));
            Object.keys(manifest.files || {}).forEach((file) => add(`scratch-editor/${file}`));
        } catch { /* Optional. */ }
        PUBLIC_EXTRAS.forEach(add);
        return this.allowed;
    }

    staticAssetUrl(path: string) {
        const config = this.readConfig();
        const base = httpsUrl(config?.publicBaseUrl);
        if (!base || !/^\/static\/[\w.-]+\/$/.test(base.pathname) || typeof path !== 'string'
            || !path.startsWith('/') || path.startsWith('//')) return path;
        try {
            const suffix = path.match(/[?#].*$/)?.[0] || '';
            const relative = decodeURIComponent(path.split(/[?#]/, 1)[0].slice(1));
            if (!safePath(relative) || !this.allowedPaths().has(relative)) return path;
            return new URL(relative.split('/').map(encodeURIComponent).join('/'), base).toString()
                + (suffix || this.backgroundVersions.get(relative) || '');
        } catch { return path; }
    }

    isEnabled() { return !!this.readConfig(); }

    private sourceJob(source: AssetSource, requireUpload = true): Job | null {
        const config = this.readConfig();
        const base = httpsUrl(config?.mediaBaseUrl);
        const endpoint = httpsUrl(config?.endpoint);
        const contentType = source?.meta?.['Content-Type'];
        const type = typeof contentType === 'string' ? contentType.split(';')[0].trim().toLowerCase() : '';
        const scratchProject = /^scratch\/[^/]+\/[a-f0-9]{24}\.sb3$/.test(source?.path || '')
            && ['application/octet-stream', 'application/x.scratch.sb3'].includes(type) && source.meta.size <= 20 * 1024 * 1024;
        const extension = scratchProject ? '.sb3' : MEDIA_TYPES[type];
        if (source?.decoration && (!['home-poster', 'badge'].includes(source.decoration)
            || !/^image\/(png|jpeg|gif|webp|avif)$/.test(type) || source.meta.size > 8 * 1024 * 1024
            || (source.decoration === 'home-poster'
                ? !/^domain\/[^/]+\/home-poster-[\w-]+\.(png|jpe?g|gif|webp|avif)$/i.test(source.path)
                : !/^(?:domain\/[^/]+\/)?badge\/\d+\/(?:profile-background|ac-effect)-[\w-]+\.(png|jpe?g|gif|webp)$/i.test(source.path)))) return null;
        const maxBytes = !requireUpload && source?.meta?.remoteAsset && !source.variant
            ? 512 * 1024 * 1024 : (this.options.maxBytes ?? 32 * 1024 * 1024);
        if (!config || !base || base.pathname !== '/'
            || typeof config.mediaSigningKey !== 'string' || !/^[a-zA-Z0-9]{16,128}$/.test(config.mediaSigningKey)
            || !config.bucket || !config.region
            || (requireUpload && (!endpoint || endpoint.pathname !== '/' || !config.accessKeyId || !config.secretAccessKey))
            || !source || !safePath(source.path) || !extension
            || !Number.isSafeInteger(source.meta.size) || source.meta.size <= 0
            || source.meta.size > maxBytes
            || (source.variant !== undefined && (typeof source.variant !== 'string' || source.variant.length > 200))
            || (source.contentDisposition !== undefined && (typeof source.contentDisposition !== 'string'
                || !/^(?:attachment|inline)(?:;[^\r\n]*)?$/.test(source.contentDisposition) || source.contentDisposition.length > 300))) return null;
        const modified = source.meta.lastModified ? new Date(source.meta.lastModified).getTime() : 0;
        const etag = typeof source.meta.etag === 'string' ? source.meta.etag : '';
        if ((!etag && !Number.isFinite(modified)) || (!etag && !modified) || etag.length > 1024) return null;
        const scope = sha256(JSON.stringify([config.bucket, config.region, config.endpoint]));
        const identityParts = [source.path, etag, source.meta.size, modified || 0, source.variant || '', type, source.contentDisposition || ''];
        if (source.decoration) identityParts.push(source.decoration);
        const identity = sha256(JSON.stringify(identityParts));
        const prefix = source.decoration === 'home-poster' ? 'static/home-posters/v1'
            : source.decoration === 'badge' ? 'media/decorations/v1' : 'media/v1';
        return { id: `${scope}:${identity}`, key: `${prefix}/${identity}${extension}`, scope, config, source };
    }

    private readIndex() {
        if (this.loadedIndex) return;
        this.loadedIndex = true;
        try {
            if (statSync(this.indexPath).size > 16 * 1024 * 1024) return;
            const index = JSON.parse(readFileSync(this.indexPath, 'utf8'));
            if (index.version !== 1) return;
            for (const [id, item] of Object.entries(index.entries || {}) as [string, Mirror][]) {
                if (/^[a-f0-9]{64}:[a-f0-9]{64}$/.test(id) && item
                    && /^(?:media\/(?:decorations\/)?v1|static\/home-posters\/v1)\/[a-f0-9]{64}\.[a-z0-9]+$/.test(item.key)
                    && /^[a-f0-9]{64}$/.test(item.sha256) && Number.isSafeInteger(item.size) && item.size > 0) {
                    this.mirrors.set(id, item);
                }
            }
        } catch { /* A missing index means first requests are served by the origin. */ }
    }

    private remember(id: string, mirror: Mirror) {
        this.mirrors.set(id, mirror);
        while (this.mirrors.size > 20_000) this.mirrors.delete(this.mirrors.keys().next().value);
        const temp = `${this.indexPath}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
        try {
            writeFileSync(temp, JSON.stringify({ version: 1, entries: Object.fromEntries(this.mirrors) }), { mode: 0o600 });
            renameSync(temp, this.indexPath);
        } catch {
            try { unlinkSync(temp); } catch { /* No partially written index remains. */ }
            // Do not redirect to a mirror that cannot be recovered after restart.
            this.mirrors.delete(id);
            throw new Error('Could not persist asset mirror index');
        }
    }

    queueAssetMirror(source: AssetSource) {
        // The primary store already owns this object. It must not be copied into a second mirror.
        if (source?.meta?.remoteAsset && !source.variant && !source.decoration) return false;
        const job = this.sourceJob(source);
        if (!job) return false;
        this.readIndex();
        if (this.mirrors.has(job.id) || this.pending.has(job.id)) return true;
        if ((this.failed.get(job.id) || 0) > this.now() || this.pending.size >= (this.options.queueLimit ?? 64)) return false;
        this.pending.add(job.id);
        this.queue.push(job);
        if (!this.active) {
            this.active = true;
            setImmediate(() => this.drain());
        }
        return true;
    }

    tryRedirectAsset(handler: any, source: AssetSource) {
        const job = this.sourceJob(source, false);
        if (!job) return false;
        const remote = source.meta.remoteAsset;
        if (remote && !source.variant && !source.decoration) {
            if (remote.bucket !== job.config.bucket || remote.region !== job.config.region
                || remote.size !== source.meta.size || remote.contentType !== source.meta['Content-Type']
                || !/^[a-f0-9]{64}$/.test(remote.sha256)
                || !/^media\/v1\/[a-f0-9]{64}\.(png|jpg|jpeg|gif|webp|avif|svg|ico|mp3|ogg|wav|m4a|sb3)$/.test(remote.key)) return false;
            this.redirect(handler, job.config, remote.key);
            return true;
        }
        this.readIndex();
        const mirror = this.mirrors.get(job.id);
        if (!mirror || mirror.key !== job.key || mirror.size !== source.meta.size) {
            this.queueAssetMirror(source);
            return false;
        }
        this.redirect(handler, job.config, mirror.key, source.decoration);
        return true;
    }

    private redirect(handler: any, config: AssetConfig, key: string, decoration?: AssetSource['decoration']) {
        handler.response.status = 302;
        handler.response.redirect = decoration === 'home-poster' ? new URL(key, config.mediaBaseUrl).toString()
            : signMediaUrl(config.mediaBaseUrl, key, config.mediaSigningKey, this.now());
        handler.response.addHeader('Cache-Control', decoration === 'home-poster' ? 'public, max-age=300'
            : decoration === 'badge' ? 'private, max-age=300' : 'private, no-store');
        if (decoration === 'badge') handler.response.addHeader('Vary', 'Cookie, Authorization');
        handler.response.addHeader('Referrer-Policy', 'no-referrer');
    }

    private client(config: AssetConfig) {
        const endpoint = config.internalEndpoint || config.endpoint;
        const id = sha256(JSON.stringify([endpoint, config.region, config.accessKeyId, config.secretAccessKey, config.sessionToken]));
        if (!this.clients.has(id)) {
            this.clients.clear();
            this.clients.set(id, this.options.client?.({ ...config, endpoint }) || new S3Client({
                endpoint,
                region: config.region,
                forcePathStyle: false,
                maxAttempts: 2,
                requestChecksumCalculation: 'WHEN_REQUIRED',
                credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, sessionToken: config.sessionToken },
            }));
        }
        return this.clients.get(id);
    }

    private async upload(job: Job) {
        const controller = new AbortController();
        let body: Buffer | Readable;
        // A 20 MiB project can take almost three minutes over the existing 1 Mbps uplink.
        const timeout = setTimeout(() => { controller.abort(); if (body && !Buffer.isBuffer(body)) body.destroy(); }, this.options.timeoutMs ?? 5 * 60_000);
        const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Asset mirror timeout')), { once: true }));
        const check = () => { if (controller.signal.aborted) throw new Error('Asset mirror timeout'); };
        const operation = (async () => {
            const load = job.source.load || (() => this.options.load
                ? this.options.load(job.source.path) : require('../model/storage').default.get(job.source.path));
            body = await load();
            if (controller.signal.aborted && !Buffer.isBuffer(body)) body.destroy();
            check();
            let bytes: Buffer;
            if (Buffer.isBuffer(body)) bytes = body;
            else {
                const chunks: Buffer[] = [];
                let length = 0;
                for await (const part of body) {
                    check();
                    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
                    length += chunk.length;
                    if (length > (this.options.maxBytes ?? 32 * 1024 * 1024)) throw new Error('Asset mirror too large');
                    chunks.push(chunk);
                }
                bytes = Buffer.concat(chunks);
            }
            if (bytes.length !== job.source.meta.size) throw new Error('Asset size changed while mirroring');
            const hash = sha256(bytes);
            const client = this.client(job.config);
            // Existing SDK 3.726.1 uses AWS V4 over the OSS S3-compatible endpoint.
            // Buffer + ContentLength avoids unsupported aws-chunked uploads.
            // https://help.aliyun.com/zh/oss/developer-reference/use-aws-sdks-to-access-oss
            await client.send(new PutObjectCommand({
                Bucket: job.config.bucket, Key: job.key, Body: bytes, ContentLength: bytes.length,
                ContentMD5: createHash('md5').update(bytes).digest('base64'),
                ContentType: job.source.meta['Content-Type'],
                CacheControl: job.source.decoration === 'home-poster' ? 'public, max-age=31536000, immutable'
                    : job.source.decoration === 'badge' ? 'private, max-age=300' : 'private, max-age=1800',
                ContentDisposition: job.source.contentDisposition,
                Metadata: { sha256: hash },
            }), { abortSignal: controller.signal });
            check();
            const verified = await client.send(new HeadObjectCommand({ Bucket: job.config.bucket, Key: job.key }), { abortSignal: controller.signal });
            check();
            if (verified.ContentLength !== bytes.length || verified.Metadata?.sha256 !== hash
                || verified.ContentType !== job.source.meta['Content-Type']
                || (verified.ContentDisposition || '') !== (job.source.contentDisposition || '')) throw new Error('Asset mirror verification failed');
            this.remember(job.id, { key: job.key, size: bytes.length, sha256: hash });
        })();
        try { await Promise.race([operation, aborted]); } finally { clearTimeout(timeout); if (body && !Buffer.isBuffer(body)) body.destroy(); }
    }

    private async drain() {
        while (this.queue.length) {
            const job = this.queue.shift();
            try { await this.upload(job); this.failed.delete(job.id); } catch {
                this.failed.set(job.id, this.now() + (this.options.retryMs ?? 5 * 60_000));
                while (this.failed.size > 256) this.failed.delete(this.failed.keys().next().value);
            } finally { this.pending.delete(job.id); }
        }
        this.active = false;
        this.idle.splice(0).forEach((resolveIdle) => resolveIdle());
    }

    waitForAssetMirrors() { return this.active ? new Promise<void>((done) => this.idle.push(done)) : Promise.resolve(); }
    status() { return { ready: this.mirrors.size, pending: this.pending.size, failed: this.failed.size }; }
}

const delivery = new AssetDelivery();
export const staticAssetUrl = (path: string) => delivery.staticAssetUrl(path);
export const tryRedirectAsset = (handler: any, source: AssetSource) => delivery.tryRedirectAsset(handler, source);
export const queueAssetMirror = (source: AssetSource) => delivery.queueAssetMirror(source);
export const waitForAssetMirrors = () => delivery.waitForAssetMirrors();
export const assetDeliveryStatus = () => delivery.status();
export const isAssetDeliveryEnabled = () => delivery.isEnabled();
