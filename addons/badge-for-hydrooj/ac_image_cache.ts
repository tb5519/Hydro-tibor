import { createHash, randomBytes } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Readable } from 'stream';
import { Worker } from 'worker_threads';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_BYTES = 128 * 1024 * 1024;
const MAX_CACHE_FILES = 512;
const MAX_QUEUE = 8;
const CACHE_VERSION = 'png-area-v1';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface ImageSource {
    path: string;
    version: string;
    size: number;
    load: () => Promise<Readable | Buffer>;
}

async function readBoundedSource(load: ImageSource['load']) {
    let stream: Readable | Buffer | undefined;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            timedOut = true;
            if (stream && !Buffer.isBuffer(stream)) stream.destroy(new Error('Badge image read timed out'));
            reject(new Error('Badge image read timed out'));
        }, 4000);
    });
    const read = async () => {
        stream = await load();
        if (timedOut) {
            if (!Buffer.isBuffer(stream)) stream.destroy();
            throw new Error('Badge image read timed out');
        }
        if (Buffer.isBuffer(stream)) {
            if (stream.length > MAX_INPUT_BYTES) throw new Error('Badge image exceeds size limit');
            return stream;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of stream) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > MAX_INPUT_BYTES) throw new Error('Badge image exceeds size limit');
            chunks.push(buffer);
        }
        return Buffer.concat(chunks, bytes);
    };
    try {
        return await Promise.race([read(), timeout]);
    } finally {
        clearTimeout(timer!);
        if (stream && !Buffer.isBuffer(stream)) stream.destroy();
    }
}

/** Only the Worker performs PNG parsing, inflation, resampling and encoding. */
export function resizeBadgeAcPng(input: Buffer, size: 384 | 768, workerPath = path.join(__dirname, 'vendor/ac_image_worker.cjs')) {
    return new Promise<Buffer>((resolve, reject) => {
        const worker = new Worker(workerPath, {
            workerData: { input, size },
            execArgv: [],
            resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
        });
        let finished = false;
        let timer: ReturnType<typeof setTimeout>;
        const finish = (error?: Error, output?: Buffer) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            void worker.terminate();
            if (error) reject(error);
            else resolve(output!);
        };
        timer = setTimeout(() => finish(new Error('Badge image worker timed out')), 8000);
        worker.once('message', (message) => {
            if (!message?.ok || !message.bytes || message.bytes.byteLength > 4 * 1024 * 1024) {
                finish(new Error('Badge image could not be resized'));
            } else finish(undefined, Buffer.from(message.bytes));
        });
        worker.once('error', (error) => finish(error));
        worker.once('exit', (code) => {
            if (!finished) finish(new Error(`Badge image worker exited (${code})`));
        });
    });
}

export class BadgeAcImageCache {
    private readonly inFlight = new Map<string, Promise<Buffer | null>>();
    private readonly failedUntil = new Map<string, number>();
    private tail: Promise<unknown> = Promise.resolve();

    constructor(private readonly directory = path.join(
        os.homedir(), '.hydro',
        ...(process.env.HYDRO_PROFILE ? ['profiles', process.env.HYDRO_PROFILE] : []),
        'cache', 'badge-ac', CACHE_VERSION,
    )) {}

    async get(source: ImageSource, size: 384 | 768): Promise<Buffer | null> {
        if (![384, 768].includes(size) || source.size <= 0 || source.size > MAX_INPUT_BYTES) return null;
        const key = createHash('sha256').update(JSON.stringify([CACHE_VERSION, source.path, source.version, size])).digest('hex');
        const filename = path.join(this.directory, `${key}.png`);
        try {
            const meta = await fs.stat(filename);
            if (meta.size > 8 && meta.size <= 4 * 1024 * 1024) {
                const cached = await fs.readFile(filename);
                if (cached.subarray(0, 8).equals(PNG_SIGNATURE)) return cached;
            }
        } catch { /* A cold cache is normal, including on a new deployment. */ }
        if (this.inFlight.has(key)) return this.inFlight.get(key)!;
        if ((this.failedUntil.get(key) || 0) > Date.now() || this.inFlight.size >= MAX_QUEUE) return null;
        const queuedAt = Date.now();
        const job = this.tail.then(async () => {
            if (Date.now() - queuedAt > 20000) return null;
            return this.generate(source, size, filename);
        }).catch(() => {
            if (this.failedUntil.size >= 256) this.failedUntil.delete(this.failedUntil.keys().next().value!);
            this.failedUntil.set(key, Date.now() + 5 * 60 * 1000);
            return null;
        });
        this.inFlight.set(key, job);
        // One job at a time, including source reads. Requests for the same
        // version share one Promise; a bounded queue cannot exhaust memory.
        this.tail = job.finally(() => this.inFlight.delete(key));
        return job;
    }

    private async generate(source: ImageSource, size: 384 | 768, filename: string) {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        const lockPath = path.join(this.directory, '.resize.lock');
        const lockToken = `${process.pid}:${randomBytes(8).toString('hex')}`;
        // The disk lock also serializes CPU work across Hydro processes.
        try {
            const lock = await fs.open(lockPath, 'wx', 0o600);
            try {
                await lock.writeFile(lockToken);
            } finally {
                await lock.close();
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            const stat = await fs.stat(lockPath).catch(() => null);
            if (stat && Date.now() - stat.mtimeMs > 45000) await fs.unlink(lockPath).catch(() => {});
            return null; // Another process is working: serve the untouched original.
        }
        try {
            const input = await readBoundedSource(source.load);
            const output = await resizeBadgeAcPng(input, size);
            const temporary = `${filename}.${lockToken.replace(':', '-')}.tmp`;
            try {
                await fs.writeFile(temporary, output, { flag: 'wx', mode: 0o600 });
                await fs.rename(temporary, filename);
            } finally {
                await fs.unlink(temporary).catch(() => {});
            }
            await this.trimCache(filename).catch(() => {});
            return output;
        } finally {
            if (await fs.readFile(lockPath, 'utf8').catch(() => '') === lockToken) {
                await fs.unlink(lockPath).catch(() => {});
            }
        }
    }

    private async trimCache(currentFilename: string) {
        const entries = (await fs.readdir(this.directory)).filter((name) => /^[a-f0-9]{64}\.png$/.test(name));
        const files = await Promise.all(entries.map(async (name) => {
            const filename = path.join(this.directory, name);
            const stat = await fs.stat(filename);
            return { filename, bytes: stat.size, time: stat.mtimeMs };
        }));
        let total = files.reduce((sum, file) => sum + file.bytes, 0);
        let count = files.length;
        for (const file of files.sort((left, right) => left.time - right.time)) {
            if (total <= MAX_CACHE_BYTES && count <= MAX_CACHE_FILES) break;
            if (file.filename === currentFilename) continue;
            // Only derived PNGs in this dedicated cache directory are evicted.
            await fs.unlink(file.filename); // eslint-disable-line no-await-in-loop
            total -= file.bytes;
            count--;
        }
    }
}

export const badgeAcImageCache = new BadgeAcImageCache();
