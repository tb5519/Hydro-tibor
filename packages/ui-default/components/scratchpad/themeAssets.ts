import type { ScratchpadTheme, ScratchpadThemeAsset } from './themes';

export const SCRATCHPAD_THEME_ASSET_TIMEOUT = 15000;
const MAX_READY_IMAGES = 192;
const MAX_READY_VIDEOS = 3;

interface PreparedAsset<T> {
  promise: Promise<boolean>;
  ready: boolean;
  element?: T;
}

// Retain decoded images, not only their request promises. A cached HTTP response
// can still need decoding when a PNG control is first painted.
const images = new Map<string, PreparedAsset<HTMLImageElement>>();
const videos = new Map<string, PreparedAsset<HTMLVideoElement>>();

function touch<T>(cache: Map<string, PreparedAsset<T>>, url: string, entry: PreparedAsset<T>) {
  cache.delete(url);
  cache.set(url, entry);
}

function trim<T>(cache: Map<string, PreparedAsset<T>>, limit: number, dispose?: (element: T) => void) {
  let readyCount = Array.from(cache.values()).filter((entry) => entry.ready).length;
  for (const [url, entry] of cache) {
    if (readyCount <= limit) break;
    if (!entry.ready) continue;
    cache.delete(url);
    if (entry.element) dispose?.(entry.element);
    readyCount -= 1;
  }
}

function disposeVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function prepareImage(url: string): Promise<boolean> {
  const cached = images.get(url);
  if (cached) {
    touch(images, url, cached);
    return cached.promise;
  }
  if (typeof Image === 'undefined') return Promise.resolve(false);

  const image = new Image();
  let resolve: (ready: boolean) => void;
  const entry: PreparedAsset<HTMLImageElement> = {
    ready: false, element: image, promise: new Promise((done) => { resolve = done; }),
  };
  images.set(url, entry);
  let settled = false;
  let decoding = false;
  const timer = setTimeout(() => finish(false), SCRATCHPAD_THEME_ASSET_TIMEOUT);
  const finish = (ready: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    image.onload = null;
    image.onerror = null;
    entry.ready = ready;
    if (ready) trim(images, MAX_READY_IMAGES);
    else if (images.get(url) === entry) images.delete(url);
    resolve(ready);
  };
  const decode = () => {
    if (settled || decoding) return;
    decoding = true;
    if (!image.naturalWidth) {
      finish(false);
      return;
    }
    if (typeof image.decode !== 'function') finish(true);
    else {
      try {
        image.decode().then(() => finish(image.naturalWidth > 0), () => {
          // Safari can reject decode() for an otherwise valid, fully loaded
          // image. Its natural dimensions still prove the image is usable.
          finish(image.complete && image.naturalWidth > 0);
        });
      } catch {
        finish(image.complete && image.naturalWidth > 0);
      }
    }
  };
  image.onload = decode;
  image.onerror = () => finish(false);
  image.decoding = 'async';
  image.src = url;
  if (image.complete) decode();
  return entry.promise;
}

function prepareVideo(url: string): Promise<boolean> {
  const cached = videos.get(url);
  if (cached) {
    touch(videos, url, cached);
    return cached.promise;
  }
  if (typeof document === 'undefined') return Promise.resolve(false);

  const video = document.createElement('video');
  let resolve: (ready: boolean) => void;
  const entry: PreparedAsset<HTMLVideoElement> = {
    ready: false, element: video, promise: new Promise((done) => { resolve = done; }),
  };
  videos.set(url, entry);
  let settled = false;
  const timer = setTimeout(() => finish(false), SCRATCHPAD_THEME_ASSET_TIMEOUT);
  const loaded = () => { if (video.readyState >= 2) finish(true); };
  const failed = () => finish(false);
  const finish = (ready: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    video.removeEventListener('loadeddata', loaded);
    video.removeEventListener('canplay', loaded);
    video.removeEventListener('error', failed);
    video.pause();
    entry.ready = ready;
    if (ready) trim(videos, MAX_READY_VIDEOS, disposeVideo);
    else {
      if (videos.get(url) === entry) videos.delete(url);
      disposeVideo(video);
    }
    resolve(ready);
  };
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.addEventListener('loadeddata', loaded);
  video.addEventListener('canplay', loaded);
  video.addEventListener('error', failed);
  video.src = url;
  video.load();
  loaded();
  return entry.promise;
}

/** Only the artwork used by this interface is required; gallery previews and
 * unassigned uploads must not delay opening the editor. */
function requiredAssets(theme: ScratchpadTheme): ScratchpadThemeAsset[] | undefined {
  const ids = new Set<string>();
  for (const slot of Object.values(theme.slots || {})) if (slot) ids.add(slot.assetId);
  for (const control of Object.values(theme.controls || {})) {
    if (!control) continue;
    ids.add(control.assetId);
    if (control.hoverAssetId) ids.add(control.hoverAssetId);
    if (control.activeAssetId) ids.add(control.activeAssetId);
  }
  if (theme.posterAssetId) ids.add(theme.posterAssetId);
  const byId = new Map((theme.assets || []).map((asset) => [asset.id, asset]));
  const result: ScratchpadThemeAsset[] = [];
  for (const id of ids) {
    const asset = byId.get(id);
    if (!asset || !asset.url || !/^(image|video)\//.test(asset.type)) return undefined;
    result.push(asset);
  }
  return result;
}

/** Resolve only when every assigned image variant and the first video frame is
 * ready. Failure leaves the caller free to retain the complete previous theme. */
export async function prepareScratchpadThemeAssets(theme: ScratchpadTheme, { includeVideo = true } = {}): Promise<boolean> {
  const assets = requiredAssets(theme);
  if (!assets) return false;
  const requests = new Map<string, Promise<boolean>>();
  for (const asset of assets) {
    const kind = asset.type.startsWith('video/') ? 'video' : 'image';
    if (kind === 'video' && !includeVideo) continue;
    const key = `${kind}:${asset.url}`;
    if (!requests.has(key)) requests.set(key, kind === 'video' ? prepareVideo(asset.url) : prepareImage(asset.url));
  }
  return (await Promise.all(requests.values())).every(Boolean);
}

/** Shared with PNG controls so their first render uses the prepared artwork. */
export function isScratchpadThemeImageReady(url: string): boolean {
  return images.get(url)?.ready === true;
}

/** Transfer the already decoded video into the background layer. Reusing the
 * element avoids a second video load and an intervening poster-only frame. */
export function takePreparedScratchpadVideo(url: string): HTMLVideoElement | undefined {
  const entry = videos.get(url);
  if (!entry?.ready || !entry.element) return undefined;
  videos.delete(url);
  return entry.element;
}
