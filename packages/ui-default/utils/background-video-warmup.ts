export interface BackgroundVideoWarmupConfig {
  scope?: string;
  items?: { url: string; poster?: string }[];
  catalog?: string;
}

export interface BackgroundVideoWarmupBinding { dispose: () => void }

const READY_TTL = 5 * 60_000;
const READY_LIMIT = 32;
const bindings = new WeakMap<Document, BackgroundVideoWarmupBinding>();

function sameOriginUrl(value: string, win: any) {
  if (typeof value !== 'string' || !value || value.length > 4096) return null;
  try {
    const url = new URL(value, win.location.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== win.location.origin
      || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

/** Only stable, versioned business routes belong in readiness hints, never signed media URLs. */
function stableUrl(value: string, win: any) {
  const url = sameOriginUrl(value, win);
  return url && ![...new URL(url).searchParams.keys()].some((key) => key !== 'v') ? url : null;
}

function readinessKey(win: any, scope?: string) {
  const value = scope ?? win.UiContext?.backgroundVideoWarmup?.scope ?? 'guest';
  return `onebyone-background-video-ready:v1:${String(value).slice(0, 256)}`;
}

function readHints(win: any, scope?: string): Record<string, number> {
  try {
    const value = JSON.parse(win.sessionStorage.getItem(readinessKey(win, scope)) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(value).filter(([url, time]) => (
      stableUrl(url, win) === url && typeof time === 'number' && Number.isFinite(time)
      && time > now - READY_TTL && time <= now + 60_000
    )).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, READY_LIMIT)) as Record<string, number>;
  } catch { return {}; }
}

/** A hint means this stable URL recently decoded; callers must still check their current video. */
export function hasBackgroundVideoReadyHint(url: string, win: any = window, scope?: string) {
  const source = stableUrl(url, win);
  return !!source && !!readHints(win, scope)[source];
}

export function rememberBackgroundVideoReady(url: string, win: any = window, scope?: string) {
  const source = stableUrl(url, win);
  if (!source) return;
  const values = readHints(win, scope);
  delete values[source];
  const entries: [string, number][] = [[source, Date.now()], ...Object.entries(values)];
  entries.sort((a, b) => b[1] - a[1]);
  try { win.sessionStorage.setItem(readinessKey(win, scope), JSON.stringify(Object.fromEntries(entries.slice(0, READY_LIMIT)))); } catch { /* Optional. */ }
}

/** Low-priority HTTP-cache and first-frame warming for this domain and the current user's selected theme. */
export function startBackgroundVideoWarmup(config: BackgroundVideoWarmupConfig, win: any = window): BackgroundVideoWarmupBinding {
  const noop = { dispose() {} };
  const doc: Document = win.document;
  if (!doc || !config || (!config.items?.length && !config.catalog)) return noop;
  const existing = bindings.get(doc);
  if (existing) return existing;
  const connection = win.navigator?.connection;
  const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (connection?.saveData || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType || '') || motion?.matches) return noop;
  const sources = [...new Map((config.items || []).slice(0, 2).map((item) => {
    const url = stableUrl(item?.url, win);
    return [url, { url, poster: stableUrl(item?.poster, win) }];
  })).values()].filter((item) => item.url);
  const catalog = sameOriginUrl(config.catalog, win);
  if (!sources.length && !catalog) return noop;

  const hiddenVideos = new Set<HTMLVideoElement>();
  const cleanupListeners: (() => void)[] = [];
  let stopped = false;
  let scheduled = false;
  let running = false;
  let idleHandle: number | null = null;
  let timerHandle: number | null = null;
  let catalogTimer: number | null = null;
  let controller: AbortController | null = null;
  const warmedUrls = new Set<string>();
  const allowed = () => !stopped && !doc.hidden && !motion?.matches
    && !connection?.saveData && !/^(slow-2g|2g|3g)$/.test(connection?.effectiveType || '');
  const cleanupVideo = (video: HTMLVideoElement) => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    hiddenVideos.delete(video);
  };
  const rememberWhenReady = (video: HTMLVideoElement, url: string, owned = false) => {
    const ready = () => { if (!stopped && video.readyState >= 2) rememberBackgroundVideoReady(url, win, config.scope); };
    const failed = () => { if (owned && hiddenVideos.has(video)) cleanupVideo(video); };
    video.addEventListener('loadeddata', ready);
    video.addEventListener('canplaythrough', ready);
    if (owned) video.addEventListener('error', failed);
    cleanupListeners.push(() => {
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('canplaythrough', ready);
      video.removeEventListener('error', failed);
    });
    ready();
  };
  const warmItems = (items: { url: string; poster?: string }[]) => {
    for (const value of items.slice(0, 2)) {
      if (!allowed() || warmedUrls.size >= 2) break;
      const item = { url: stableUrl(value?.url, win), poster: stableUrl(value?.poster, win) };
      if (!item.url || warmedUrls.has(item.url)) continue;
      warmedUrls.add(item.url);
      const video = [...doc.querySelectorAll<HTMLVideoElement>('video')].find((candidate) => (
        stableUrl(candidate.getAttribute('src') || candidate.currentSrc || candidate.querySelector('source')?.getAttribute('src'), win) === item.url
        || stableUrl(candidate.closest<HTMLElement>('[data-loop-background]')?.dataset.backgroundVideoSrc, win) === item.url
      ));
      if (video) {
        rememberWhenReady(video, item.url);
        continue;
      }
      // A visible background is initialized by its player. Do not race it with a duplicate download.
      if ([...doc.querySelectorAll<HTMLElement>('[data-loop-background]')]
        .some((root) => stableUrl(root.dataset.backgroundVideoSrc, win) === item.url)) continue;
      const preload = doc.createElement('video');
      preload.dataset.backgroundVideoWarmup = '';
      preload.muted = true;
      preload.defaultMuted = true;
      preload.playsInline = true;
      preload.autoplay = false;
      preload.controls = false;
      preload.preload = 'auto';
      preload.tabIndex = -1;
      preload.setAttribute('aria-hidden', 'true');
      preload.setAttribute('muted', '');
      preload.setAttribute('playsinline', '');
      preload.setAttribute('fetchpriority', 'low');
      preload.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:0;opacity:0;pointer-events:none;';
      if (item.poster) preload.poster = item.poster;
      hiddenVideos.add(preload);
      rememberWhenReady(preload, item.url, true);
      doc.body.append(preload);
      preload.src = item.url;
      preload.load();
    }
  };
  const run = async () => {
    scheduled = false;
    idleHandle = null;
    timerHandle = null;
    if (!allowed() || running) return;
    running = true;
    // The public homepage source does not wait for the authenticated theme catalog.
    warmItems(sources);
    if (!catalog || !win.fetch || !win.AbortController || typeof config.scope !== 'string'
      || !allowed() || warmedUrls.size >= 2) return;
    controller = new win.AbortController();
    catalogTimer = win.setTimeout(() => controller?.abort(), 15_000);
    try {
      const response = await win.fetch(catalog, {
        credentials: 'same-origin', priority: 'low', cache: 'no-store',
        headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      if (!allowed() || controller.signal.aborted || !response.ok
        || !/^application\/json/i.test(response.headers?.get('Content-Type') || '')) return;
      const data = await response.json();
      if (!allowed() || controller.signal.aborted || data?.scope !== config.scope || !Array.isArray(data.items)
        || (win.UiContext?.backgroundVideoWarmup?.scope && win.UiContext.backgroundVideoWarmup.scope !== config.scope)) return;
      warmItems(data.items);
    } catch { /* A failed or expired-login catalog never affects the page or the homepage preload. */ }
    finally {
      if (catalogTimer !== null) win.clearTimeout(catalogTimer);
      catalogTimer = null;
    }
  };
  const runQuietly = () => { run().catch(() => {}); };
  const schedule = () => {
    if (scheduled || running || !allowed() || doc.readyState !== 'complete') return;
    scheduled = true;
    if (win.requestIdleCallback) idleHandle = win.requestIdleCallback(runQuietly, { timeout: 2000 });
    else timerHandle = win.setTimeout(runQuietly, 350);
  };
  const binding: BackgroundVideoWarmupBinding = {
    dispose() {
      if (stopped) return;
      stopped = true;
      if (idleHandle !== null) win.cancelIdleCallback?.(idleHandle);
      if (timerHandle !== null) win.clearTimeout(timerHandle);
      if (catalogTimer !== null) win.clearTimeout(catalogTimer);
      controller?.abort();
      win.removeEventListener('load', schedule);
      win.removeEventListener('pagehide', binding.dispose);
      doc.removeEventListener('visibilitychange', schedule);
      for (const remove of cleanupListeners) remove();
      for (const video of hiddenVideos) cleanupVideo(video);
      bindings.delete(doc);
    },
  };
  bindings.set(doc, binding);
  win.addEventListener('load', schedule, { once: true });
  win.addEventListener('pagehide', binding.dispose, { once: true });
  doc.addEventListener('visibilitychange', schedule);
  schedule();
  return binding;
}
