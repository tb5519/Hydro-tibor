import { markAchievementThumbnailReady } from './achievement_wall';

export interface AchievementAssetPreloads {
  achievementThumbnailPreload?: string[];
  achievementImagePreload?: string[];
}

type AssetKind = 'thumbnail' | 'image';
type AssetWindow = Window & typeof globalThis;
interface AssetEntry {
  url: string;
  kind: AssetKind;
  state: 'queued' | 'loading' | 'ready' | 'failed';
  image?: HTMLImageElement;
  cleanup?: () => void;
  failedAt?: number;
}
interface AssetPool {
  enqueue: (config: AchievementAssetPreloads) => void;
  dispose: () => void;
}

const pools = new WeakMap<Window, AssetPool>();
const THUMBNAIL_CONCURRENCY = 6;
const IMAGE_CONCURRENCY = 2;
const IMAGE_LIMIT = 6;
const TIMEOUT_MS = 30_000;
const HISTORY_LIMIT = 256;

function assetUrl(value: unknown, kind: AssetKind, win: AssetWindow) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value, win.location.href);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== win.location.origin || url.username || url.password) return '';
    if (!/^\/(?:d\/[^/]+\/)?achievement\/[^/]+\/image$/.test(url.pathname)) return '';
    if (!url.searchParams.get('v') || url.searchParams.getAll('v').length !== 1) return '';
    if (kind === 'thumbnail' ? url.searchParams.get('size') !== '384' : url.searchParams.has('size')) return '';
    if ([...url.searchParams.keys()].some((key) => !['v', 'size'].includes(key))) return '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}

/** Warm normal HTTP image cache by versioned URL; profile switches reuse the same assets. */
export function startAchievementAssetWarmup(config: AchievementAssetPreloads, win: AssetWindow = window) {
  if (!config || !win.document || !win.Image) return;
  const existing = pools.get(win);
  if (existing) { existing.enqueue(config); return existing; }
  const doc = win.document;
  const entries = new Map<string, AssetEntry>();
  const queues: Record<AssetKind, AssetEntry[]> = { thumbnail: [], image: [] };
  const active: Record<AssetKind, number> = { thumbnail: 0, image: 0 };
  let domReady = doc.readyState !== 'loading';
  let stopped = false;

  const prune = () => {
    if (entries.size <= HISTORY_LIMIT) return;
    for (const [url, entry] of entries) {
      if (entry.state === 'ready' || entry.state === 'failed') entries.delete(url);
      if (entries.size <= HISTORY_LIMIT) break;
    }
  };
  const add = (url: string, kind: AssetKind) => {
    if (!url) return;
    const previous = entries.get(url);
    if (previous && (previous.state !== 'failed' || win.Date.now() - (previous.failedAt || 0) < TIMEOUT_MS)) return;
    const entry: AssetEntry = { url, kind, state: 'queued' };
    entries.set(url, entry);
    queues[kind].push(entry);
  };
  const prioritizeWall = () => {
    const visible = new Set<string>();
    doc.querySelectorAll<HTMLImageElement>('[data-achievement-wall] [data-achievement-tile] img').forEach((image) => {
      const url = assetUrl(image.src, 'thumbnail', win);
      if (url) { visible.add(url); add(url, 'thumbnail'); }
    });
    queues.thumbnail.sort((left, right) => Number(visible.has(right.url)) - Number(visible.has(left.url)));
  };
  const drain = (kind: AssetKind) => {
    if (stopped || (kind === 'image' && !domReady)) return;
    const limit = kind === 'thumbnail' ? THUMBNAIL_CONCURRENCY : IMAGE_CONCURRENCY;
    while (active[kind] < limit && queues[kind].length) {
      const entry = queues[kind].shift()!;
      if (entries.get(entry.url) !== entry || entry.state !== 'queued') continue;
      active[kind]++;
      entry.state = 'loading';
      // Hold the Image until load and decode have both finished, including when
      // it is not attached to the DOM and a later configuration arrives.
      const image = new win.Image();
      entry.image = image;
      let settled = false;
      let decoding = false;
      const cleanup = () => {
        win.clearTimeout(timer);
        image.onload = null; image.onerror = null;
        entry.image = undefined; entry.cleanup = undefined;
      };
      const finish = (success: boolean) => {
        if (settled || stopped) return;
        settled = true;
        cleanup();
        active[kind]--;
        entry.state = success ? 'ready' : 'failed';
        if (success && kind === 'thumbnail') markAchievementThumbnailReady(entry.url, win);
        if (!success) entry.failedAt = win.Date.now();
        prune();
        drain(kind);
      };
      const timer = win.setTimeout(() => {
        finish(false);
        // Only detach this private preloader. An already-rendered wall owns its
        // own Image and continues waiting/retrying independently.
        image.removeAttribute('src');
      }, TIMEOUT_MS);
      entry.cleanup = () => { settled = true; cleanup(); image.removeAttribute('src'); };
      const loaded = () => {
        if (settled || decoding || stopped) return;
        if (!image.naturalWidth) { finish(false); return; }
        decoding = true;
        Promise.resolve().then(() => image.decode?.()).then(() => finish(true), () => finish(false));
      };
      image.onload = loaded;
      image.onerror = () => finish(false);
      image.loading = 'eager';
      image.decoding = 'async';
      image.fetchPriority = kind === 'thumbnail' ? 'high' : 'auto';
      image.src = entry.url;
      if (image.complete) loaded();
    }
  };
  const enqueue = (next: AchievementAssetPreloads) => {
    if (stopped) return;
    const thumbnails = Array.isArray(next.achievementThumbnailPreload) ? next.achievementThumbnailPreload.slice(0, HISTORY_LIMIT) : [];
    thumbnails.forEach((value) => add(assetUrl(value, 'thumbnail', win), 'thumbnail'));
    const images = Array.isArray(next.achievementImagePreload) ? next.achievementImagePreload.slice(0, HISTORY_LIMIT) : [];
    [...new Set(images.map((value) => assetUrl(value, 'image', win)).filter(Boolean))].slice(0, IMAGE_LIMIT)
      .forEach((url) => add(url, 'image'));
    prioritizeWall();
    prune();
    drain('thumbnail'); drain('image');
  };
  const onReady = () => { domReady = true; prioritizeWall(); drain('thumbnail'); drain('image'); };
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    doc.removeEventListener('DOMContentLoaded', onReady);
    win.removeEventListener('pagehide', onPageHide);
    entries.forEach((entry) => entry.cleanup?.());
    entries.clear(); queues.thumbnail.length = 0; queues.image.length = 0;
    pools.delete(win);
  };
  const onPageHide = (event: PageTransitionEvent) => { if (!event.persisted) dispose(); };
  const pool = { enqueue, dispose };
  pools.set(win, pool);
  if (!domReady) doc.addEventListener('DOMContentLoaded', onReady, { once: true });
  win.addEventListener('pagehide', onPageHide);
  enqueue(config);
  return pool;
}
