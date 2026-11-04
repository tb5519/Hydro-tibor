/** Authorized media bytes are reusable across expiring download signatures. */
export const MEDIA_CACHE_NAME = 'onebyone-media-v1';
export const MEDIA_CACHE_SECONDS = 365 * 24 * 60 * 60;
const DEFAULT_CAPACITY = 256 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const CACHE_PATH = '/.onebyone-media-cache/v1/';

interface MediaDescriptor {
  version: string;
  scope: string;
  type: string;
  size: number;
  url: string;
  contentDisposition?: string;
}

interface Options {
  fetch: typeof fetch;
  caches: CacheStorage;
  origin?: string;
  now?: () => number;
  capacity?: number;
  chunkSize?: number;
}

interface CachedPart { start: number; end: number; size: number; created: number; used: number }
interface CacheState { cache: Cache; entries: Map<string, CachedPart>; writes: Promise<void> }
const states = new WeakMap<CacheStorage, Promise<CacheState>>();

function mediaType(type: string) {
  // SVG can execute when navigated to. Leave its original CSP and delivery intact.
  return /^(?:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)|audio\/(?:mpeg|ogg|wav|wave|x-wav|mp4|x-m4a|aac|flac|webm)|video\/(?:mp4|webm|ogg|quicktime))$/.test(type);
}

export function isMediaCacheRequest(request: Request, origin = self.location.origin) {
  if (request.method !== 'GET' || request.mode === 'navigate') return false;
  const url = new URL(request.url);
  if (url.origin !== origin || request.headers.has('X-Hydro-Media-Cache')) return false;
  const path = url.pathname.replace(/^\/d\/[^/]+(?=\/)/, '');
  if (/\.(?:sb3|sprite3|svg)$/i.test(path)) return false;
  return /^\/badge\/\d+\/(?:background|background-video|background-video-poster|ac-image|icon-image|theme-sound)$/.test(path)
    || /^\/achievement\/(?:sound|[a-z0-9-]+\/image)$/.test(path)
    || /^\/home\/(?:poster|video|video-poster)$/.test(path)
    || /^\/code-editor\/theme-asset\/[a-f0-9]{32}\/[a-f0-9]{24}$/.test(path)
    || /^\/domain\/avatar\/[^/]+$/.test(path)
    || /^\/lottery\/prize\/[^/]+$/.test(path)
    || /^\/file\/\d+\/[^/]+$/.test(path)
    || /^\/p\/[^/]+\/file\/[^/]+$/.test(path)
    || /^\/training\/[^/]+\/file\/[^/]+$/.test(path)
    || /^\/contest\/[^/]+\/file\/(?:public|private)\/[^/]+$/.test(path)
    || /^\/daily-quiz\/[^/]+\/file\/[^/]+\/[^/]+$/.test(path)
    || /^\/manage\/daily-quiz\/student\/\d+\/upcoming\/[^/]+\/[^/]+\/[^/]+\/file\/[^/]+\/[^/]+$/.test(path)
    || /^\/manage\/users\/daily-quiz\/\d+\/[^/]+\/file\/[^/]+\/[^/]+$/.test(path)
    || /^\/scratch\/(?:file\/[^/]+|(?:work|community)\/[^/]+\/thumbnail|assignment\/[^/]+\/quiz\/file\/[^/]+)$/.test(path);
}

function descriptor(value: any, origin: string): MediaDescriptor | null {
  if (!value || !/^[a-f0-9]{64}$/.test(value.version) || !/^[a-f0-9]{64}$/.test(value.scope)
    || typeof value.type !== 'string' || !mediaType(value.type)
    || !Number.isSafeInteger(value.size) || value.size <= 0 || typeof value.url !== 'string') return null;
  try {
    const url = new URL(value.url, origin);
    if (url.username || url.password || url.hash || (url.origin !== origin && url.protocol !== 'https:')) return null;
    if (value.contentDisposition !== undefined && (typeof value.contentDisposition !== 'string'
      || !/^(?:inline|attachment)(?:;[^\r\n]*)?$/.test(value.contentDisposition))) return null;
    return { version: value.version, scope: value.scope, type: value.type, size: value.size, url: url.href,
      contentDisposition: value.contentDisposition };
  } catch { return null; }
}

function parseRange(value: string | null, size: number): { start: number; end: number } | null | false {
  if (!value) return { start: 0, end: size - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || (!match[1] && !Number.isSafeInteger(Number(match[2])))) return null;
  if ((!match[1] && Number(match[2]) === 0) || start >= size || start > end) return false;
  end = Math.min(end, size - 1);
  return { start, end };
}

async function openState(storage: CacheStorage): Promise<CacheState> {
  if (!states.has(storage)) {
    const pending = (async () => {
      const cache = await storage.open(MEDIA_CACHE_NAME);
      const entries = new Map<string, CachedPart>();
      await Promise.all((await cache.keys()).map(async (request) => {
        const response = await cache.match(request);
        const range = /\/(\d+)-(\d+)$/.exec(new URL(request.url).pathname);
        const created = Number(response?.headers.get('X-Hydro-Media-Created'));
        const size = Number(response?.headers.get('Content-Length'));
        if (range && created > 0 && Number.isSafeInteger(size) && size === Number(range[2]) - Number(range[1]) + 1) {
          entries.set(request.url, { start: Number(range[1]), end: Number(range[2]), size, created, used: created });
        } else await cache.delete(request);
      }));
      return { cache, entries, writes: Promise.resolve() };
    })();
    states.set(storage, pending);
    pending.catch(() => states.delete(storage));
  }
  return states.get(storage);
}

async function cachedBytes(state: CacheState | null, prefix: string, start: number, end: number, now: number) {
  if (!state) return null;
  for (const [key, part] of state.entries) {
    if (!key.startsWith(prefix) || part.start > start || part.end < end) continue;
    if (now - part.created >= MEDIA_CACHE_SECONDS * 1000 || part.created > now + 300_000) continue;
    try {
      const response = await state.cache.match(key);
      if (response) {
        const bytes = await boundedBytes(response, part.size);
        part.used = now;
        return bytes.slice(start - part.start, end - part.start + 1);
      }
      state.entries.delete(key);
      await state.cache.delete(key);
    } catch {
      state.entries.delete(key);
      await state.cache.delete(key).catch(() => {});
      return null;
    }
  }
  return null;
}

async function saveBytes(state: CacheState | null, key: string, bytes: Uint8Array, start: number, end: number,
  options: Options, signal: AbortSignal) {
  if (!state || signal.aborted) return;
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  if (bytes.byteLength > capacity) return;
  const write = async () => {
    if (signal.aborted) return;
    const now = (options.now || Date.now)();
    let size = [...state.entries.values()].reduce((sum, entry) => sum + entry.size, 0);
    for (const [oldKey, entry] of [...state.entries].sort((a, b) => a[1].used - b[1].used)) {
      if (oldKey !== key && now - entry.created < MEDIA_CACHE_SECONDS * 1000 && size + bytes.byteLength <= capacity) continue;
      await state.cache.delete(oldKey);
      state.entries.delete(oldKey);
      size -= entry.size;
    }
    await state.cache.put(key, new Response(bytes, { headers: {
      'Content-Length': String(bytes.byteLength),
      'X-Hydro-Media-Created': String(now),
      'Cache-Control': `private, max-age=${MEDIA_CACHE_SECONDS}, immutable`,
    } }));
    state.entries.set(key, { start, end, size: bytes.byteLength, created: now, used: now });
  };
  // Serialize capacity accounting across concurrent image and video requests.
  state.writes = state.writes.then(write, write).catch(() => {});
  await state.writes;
}

async function boundedBytes(response: Response, expected: number) {
  if (!response.body) throw new Error('Missing media body');
  const reader = response.body.getReader();
  const bytes = new Uint8Array(expected);
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > expected) throw new Error('Unexpected media length');
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    if (offset !== expected) throw new Error('Truncated media body');
    return bytes;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

async function downloadPart(info: MediaDescriptor, start: number, end: number, state: CacheState | null,
  prefix: string, options: Options, signal: AbortSignal, origin: string, chunkSize: number,
  refresh: () => Promise<MediaDescriptor | null>) {
  const cached = await cachedBytes(state, prefix, start, end, (options.now || Date.now)());
  if (cached) return cached;
  const whole = start === 0 && end === info.size - 1;
  const download = () => options.fetch(info.url, {
    mode: 'cors', credentials: new URL(info.url).origin === origin ? 'same-origin' : 'omit',
    cache: 'no-store', signal, headers: whole ? {} : { Range: `bytes=${start}-${end}` },
  });
  let response = await download();
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => {});
    const current = await refresh();
    if (!current || current.scope !== info.scope || current.version !== info.version
      || current.size !== info.size || current.type !== info.type) throw new Error('Media access or version changed');
    info.url = current.url;
    response = await download();
  }
  let bodyStart = start;
  let bodyEnd = end;
  if (response.status === 200 && info.size <= chunkSize) {
    bodyStart = 0;
    bodyEnd = info.size - 1;
  } else if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes ${start}-${end}/${info.size}`) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Media source did not supply the requested range');
  }
  const type = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (type !== info.type) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Unexpected media type');
  }
  const bytes = await boundedBytes(response, bodyEnd - bodyStart + 1);
  if (signal.aborted) throw signal.reason;
  await saveBytes(state, `${prefix}${bodyStart}-${bodyEnd}`, bytes, bodyStart, bodyEnd, options, signal);
  return bytes.subarray(start - bodyStart, end - bodyStart + 1);
}

/** Each call authorizes the current logical file before reading persistent bytes. */
export async function fetchCachedMedia(request: Request, options: Options): Promise<Response> {
  const origin = options.origin || new URL(request.url).origin;
  const fallback = () => options.fetch(request);
  const headers = new Headers(request.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Hydro-Media-Cache', 'resolve-v1');
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const resolve = (signal = request.signal) => options.fetch(request.url, {
    headers, credentials: 'same-origin', cache: 'no-store', signal,
  });
  let resolved: Response;
  let info: MediaDescriptor | null;
  try {
    resolved = await resolve();
    const type = resolved.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() || '';
    if (mediaType(type)) return resolved;
    if (!resolved.ok || type !== 'application/json') {
      await resolved.body?.cancel().catch(() => {});
      return fallback();
    }
    info = descriptor((await resolved.json())?.mediaCache, origin);
  } catch (error) {
    if (request.signal.aborted) throw error;
    return fallback();
  }
  if (!info) return fallback();
  const ifRange = request.headers.get('If-Range');
  const rangeHeader = !ifRange || ifRange === `"${info.version}"` ? request.headers.get('Range') : null;
  const range = parseRange(rangeHeader, info.size);
  if (range === null) return fallback();
  if (range === false) return new Response(null, { status: 416, headers: {
    'Content-Range': `bytes */${info.size}`, 'Cache-Control': 'private, no-store',
  } });
  const chunkSize = Math.max(1, Math.min(options.chunkSize ?? DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_SIZE));
  const prefix = `${origin}${CACHE_PATH}${info.scope}/${info.version}/`;
  let state: CacheState | null = null;
  try { state = await openState(options.caches); } catch { /* Disk access must not prevent playback. */ }
  const controller = new AbortController();
  const abort = () => controller.abort(request.signal.reason);
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const cleanup = () => request.signal.removeEventListener('abort', abort);
  const refresh = async () => {
    const response = await resolve(controller.signal);
    if (!response.ok || !response.headers.get('Content-Type')?.startsWith('application/json')) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    return descriptor((await response.json())?.mediaCache, origin);
  };
  const read = (start: number, end: number) => downloadPart(info, start, end, state, prefix,
    options, controller.signal, origin, chunkSize, refresh);
  let next = range.start;
  let first: Uint8Array;
  try { first = await read(next, Math.min(range.end, next + chunkSize - 1)); } catch (error) {
    cleanup();
    if (request.signal.aborted) throw error;
    return fallback();
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(stream) {
      try {
        if (controller.signal.aborted) throw controller.signal.reason;
        const bytes = first || await read(next, Math.min(range.end, next + chunkSize - 1));
        first = null;
        next += bytes.byteLength;
        stream.enqueue(bytes);
        if (next > range.end) { cleanup(); stream.close(); }
      } catch (error) { cleanup(); controller.abort(); stream.error(error); }
    },
    cancel() { cleanup(); controller.abort(); },
  }, { highWaterMark: 0 });
  const responseHeaders = new Headers({
    'Content-Type': info.type,
    'Content-Length': String(range.end - range.start + 1),
    'Accept-Ranges': 'bytes',
    'ETag': `"${info.version}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  if (rangeHeader) responseHeaders.set('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`);
  if (info.contentDisposition) responseHeaders.set('Content-Disposition', info.contentDisposition);
  return new Response(body, { status: rangeHeader ? 206 : 200, headers: responseHeaders });
}
