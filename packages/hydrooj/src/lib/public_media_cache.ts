import { createHash } from 'crypto';
import { lstatSync, readFileSync, realpathSync } from 'fs';
import { readFile } from 'fs/promises';
import { extname, resolve, sep } from 'path';
import { lookup } from 'mime-types';

const VERSION = '__public_media';
const YEAR = 'public, max-age=31536000, immutable';
const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg', '.ico',
    '.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac', '.mp4', '.webm', '.mov', '.ogv']);
const EXTRAS = ['favicon.ico', 'favicon.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-96x96.png',
    'apple-touch-icon-180x180.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png',
    'img/avatar.png', 'img/team_avatar.png'];
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

interface PublicMedia { file: string; version: string; type: string; modified: Date }

/** Only release-owned public media is eligible. Uploaded SVGs and business APIs never enter this map. */
export function publicMediaSnapshot(directory: string) {
    const media = new Map<string, PublicMedia>();
    const root = realpathSync(directory);
    const add = (relative: unknown, expected?: unknown) => {
        if (typeof relative !== 'string' || !relative || relative.startsWith('/') || /[\\?#\u0000-\u001f]/.test(relative)
            || relative.split('/').some((part) => !part || part === '.' || part === '..')
            || !EXTENSIONS.has(extname(relative).toLowerCase())) return;
        const file = resolve(root, relative);
        try {
            const stat = lstatSync(file);
            const type = lookup(relative);
            if (!stat.isFile() || !stat.size || !realpathSync(file).startsWith(`${root}${sep}`)
                || !type || !/^(image|audio|video)\//.test(type)) return;
            const version = digest(readFileSync(file));
            if (expected !== undefined && expected !== version) return;
            media.set(`/${relative}`, { file, version, type, modified: stat.mtime });
        } catch { /* Missing or invalid release entries retain ordinary static handling. */ }
    };
    try {
        const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
        for (const value of Object.values(manifest)) {
            if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) continue;
            try { add(decodeURIComponent(value.split(/[?#]/, 1)[0].slice(1))); } catch { /* Invalid URL. */ }
        }
    } catch { /* An addon's public directory need not contain a UI manifest. */ }
    try {
        const manifest = JSON.parse(readFileSync(resolve(root, 'scratch-editor/build-manifest.json'), 'utf8'));
        for (const [file, version] of Object.entries(manifest.files || {})) {
            if (typeof version === 'string' && /^[a-f0-9]{64}$/.test(version)) add(`scratch-editor/${file}`, version);
        }
    } catch { /* Scratch is optional. */ }
    EXTRAS.forEach((file) => add(file));
    return media;
}

/** Snapshot alongside the static middleware at startup. A restart selects the next prepared release. */
export function publicMediaCache(directory: string) {
    const media = publicMediaSnapshot(directory);
    return async (context: any, next: () => Promise<unknown>) => {
        if (!['GET', 'HEAD'].includes(context.method)) return next();
        let path: string;
        try { path = decodeURIComponent(context.path); } catch { return next(); }
        const asset = media.get(path);
        if (!asset) return next();
        const query = new URLSearchParams(context.querystring);
        if (query.getAll(VERSION).length !== 1 || query.get(VERSION) !== asset.version) {
            query.set(VERSION, asset.version);
            context.set('Cache-Control', 'no-store');
            context.redirect(`${context.path}?${query}`);
            return;
        }
        // Read and verify the bytes we will send, rather than trusting a manifest
        // while git is replacing files immediately before the service restarts.
        // Do not retain all Scratch artwork/audio in the server's memory.
        let bytes: Buffer;
        try {
            if (!lstatSync(asset.file).isFile() || realpathSync(asset.file) !== asset.file) throw new Error('Changed public asset');
            bytes = await readFile(asset.file);
            if (digest(bytes) !== asset.version) throw new Error('Changed public asset');
        } catch {
            context.status = 409;
            context.set('Cache-Control', 'no-store');
            context.body = 'Public media release changed. Retry after the update completes.';
            return;
        }
        context.status = 200;
        context.type = asset.type;
        context.set('Cache-Control', YEAR);
        context.set('X-Content-Type-Options', 'nosniff');
        context.set('Accept-Ranges', 'bytes');
        context.set('ETag', `"${asset.version}"`);
        context.lastModified = asset.modified;
        if (context.fresh) {
            context.status = 304;
            return;
        }
        let start = 0;
        let end = bytes.length - 1;
        const range = context.get('Range');
        const ifRange = context.get('If-Range');
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match && (match[1] || match[2]) && (!ifRange || ifRange === `"${asset.version}"`)) {
            start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
            end = match[1] && match[2] ? Math.min(bytes.length - 1, Number(match[2])) : bytes.length - 1;
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= bytes.length) {
                context.status = 416;
                context.set('Cache-Control', 'no-store');
                context.set('Content-Range', `bytes */${bytes.length}`);
                context.body = '';
                return;
            }
            context.status = 206;
            context.set('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
        }
        context.length = end - start + 1;
        if (context.method === 'GET') context.body = bytes.subarray(start, end + 1);
    };
}
