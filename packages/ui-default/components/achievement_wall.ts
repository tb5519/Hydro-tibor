const pendingWalls = new WeakMap<HTMLElement, () => void>();

const CACHE_KEY = 'hydro:achievement-wall:ready:v1';
const READY_LIMIT = 256;
const REVEAL_STEP_MS = 60;
const readyImages = new WeakMap<Window, Set<string>>();

function imageHistory(win: Window) {
  let history = readyImages.get(win);
  if (!history) {
    history = new Set<string>();
    try {
      const saved = JSON.parse(win.localStorage.getItem(CACHE_KEY) || '[]');
      if (Array.isArray(saved)) saved.slice(-READY_LIMIT).forEach((url) => {
        if (typeof url === 'string' && url.length < 2048) history!.add(url);
      });
    } catch { /* Private browsing or full storage must not block the wall. */ }
    readyImages.set(win, history);
  }
  return history;
}

function rememberImage(win: Window, url: string, success: boolean) {
  if (!url) return;
  const history = imageHistory(win);
  history.delete(url);
  if (success) history.add(url);
  while (history.size > READY_LIMIT) history.delete(history.values().next().value!);
  try { win.localStorage.setItem(CACHE_KEY, JSON.stringify([...history])); } catch { /* Optional animation history. */ }
}

/** Preloaded thumbnails share the same URL/version history as visible walls. */
export function markAchievementThumbnailReady(url: string, win: Window = window) {
  rememberImage(win, url, true);
}

/** Keep configured artwork hidden until every thumbnail can be painted. */
export function prepareAchievementWall(root: HTMLElement, timeoutMs = 8000) {
  const existing = pendingWalls.get(root);
  if (existing) return existing;
  const win = root.ownerDocument.defaultView!;
  const history = imageHistory(win);
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const tiles = Array.from(root.querySelectorAll<HTMLElement>('[data-achievement-tile]')).filter((tile) => {
    const image = tile.querySelector<HTMLImageElement>('img');
    if (image?.getAttribute('src')?.trim()) return true;
    // Achievements awaiting artwork do not block the configured collection.
    // A configured image that is still downloading must remain in the batch.
    tile.hidden = true;
    tile.setAttribute('data-achievement-pending', '');
    return false;
  });
  const count = root.querySelector<HTMLElement>('[data-achievement-count]');
  const countLabel = root.querySelector<HTMLElement>('[data-achievement-count-label]');
  const total = Number(countLabel?.dataset.achievementTotal) || 0;
  const updateCount = (value: number) => {
    if (count) count.textContent = String(value);
    countLabel?.setAttribute('aria-label', `已点亮 ${value} / ${total} 个成就系列`);
  };
  const grid = root.querySelector<HTMLElement>('.achievement-wall__grid');
  const hint = root.querySelector<HTMLElement>('[data-achievement-hint]');
  const ready = new Set<HTMLElement>();
  const shown = new Set<HTMLElement>();
  const queue: HTMLElement[] = [];
  const cleanups: Array<() => void> = [];
  const animationTimers = new Set<number>();
  let disposed = false;
  let released = false;
  let revealTimer: number | undefined;
  let countTimer: number | undefined;
  let nextRevealAt = 0;
  const warm = tiles.every((tile) => {
    const image = tile.querySelector<HTMLImageElement>('img');
    return image && (history.has(image.src) || image.complete && image.naturalWidth > 0);
  });
  root.removeAttribute('data-achievement-wall-loading');
  root.setAttribute('aria-busy', 'true');
  root.classList.remove('is-ready');
  updateCount(0);
  grid?.setAttribute('data-achievement-grid-empty', '');
  if (hint) hint.hidden = true;
  tiles.forEach((tile) => tile.setAttribute('data-achievement-pending', ''));

  const settled = () => {
    if (!released || queue.length) return;
    root.setAttribute('aria-busy', 'false');
    root.classList.add('is-ready');
  };
  const show = (tile: HTMLElement, animate: boolean) => {
    if (disposed || shown.has(tile)) return;
    shown.add(tile);
    tile.removeAttribute('data-achievement-pending');
    grid?.removeAttribute('data-achievement-grid-empty');
    if (hint) hint.hidden = false;
    if (count) {
      updateCount(shown.size);
      count.classList.remove('is-counting');
      win.clearTimeout(countTimer);
      if (animate && !reducedMotion) {
        void count.offsetWidth;
        count.classList.add('is-counting');
        countTimer = win.setTimeout(() => count.classList.remove('is-counting'), 120);
      }
    }
    if (animate && !reducedMotion) {
      tile.classList.add('is-entering');
      const timer = win.setTimeout(() => { tile.classList.remove('is-entering'); animationTimers.delete(timer); }, 180);
      animationTimers.add(timer);
    }
  };
  const revealNext = () => {
    revealTimer = undefined;
    if (disposed || !queue.length) return;
    const pause = nextRevealAt - win.performance.now();
    if (pause > 0) { revealTimer = win.setTimeout(revealNext, pause); return; }
    show(queue.shift()!, true);
    nextRevealAt = win.performance.now() + REVEAL_STEP_MS;
    if (queue.length) revealTimer = win.setTimeout(revealNext, REVEAL_STEP_MS);
    settled();
  };
  const release = () => {
    if (disposed || released || ready.size !== tiles.length) return;
    released = true;
    if (warm || reducedMotion) tiles.forEach((tile) => show(tile, false));
    else { queue.push(...tiles); revealNext(); }
    settled();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    win.clearTimeout(revealTimer); win.clearTimeout(countTimer);
    animationTimers.forEach((timer) => win.clearTimeout(timer));
    cleanups.forEach((cleanup) => cleanup());
    tiles.forEach((tile) => tile.classList.remove('is-entering'));
    count?.classList.remove('is-counting');
    queue.length = 0;
    pendingWalls.delete(root);
  };
  pendingWalls.set(root, dispose);

  const begin: Array<() => void> = [];
  tiles.forEach((tile) => {
    tile.classList.remove('is-entering');
    const image = tile.querySelector<HTMLImageElement>('img')!;
    const source = image.src;
    const nativeReady = image.complete && image.naturalWidth > 0;
    let decoding = false;
    let generation = 0;
    let retries = 0;
    let retryTimer: number | undefined;
    let watchdog: number | undefined;
    const cleanup = () => {
      image.removeEventListener('load', loaded); image.removeEventListener('error', failed);
      win.clearTimeout(retryTimer); win.clearTimeout(watchdog);
    };
    const finish = () => {
      if (disposed || ready.has(tile)) return;
      cleanup();
      rememberImage(win, source, true);
      ready.add(tile);
      release();
    };
    const watch = () => {
      win.clearTimeout(watchdog);
      watchdog = win.setTimeout(() => {
        // Slow downloads stay hidden and may still complete. Never abort them
        // just because eight seconds elapsed or substitute a placeholder.
        if (!disposed && !ready.has(tile) && image.complete && !image.naturalWidth) failed();
      }, timeoutMs);
    };
    const failed = () => {
      if (disposed || ready.has(tile)) return;
      generation++; decoding = false;
      rememberImage(win, source, false);
      win.clearTimeout(watchdog);
      if (retryTimer !== undefined || retries >= 5) return;
      const delay = Math.min(30_000, 1000 * 2 ** retries++);
      retryTimer = win.setTimeout(() => {
        retryTimer = undefined;
        if (disposed || ready.has(tile)) return;
        generation++; decoding = false;
        // Retain the versioned URL so successful responses remain cacheable.
        image.src = source;
        watch();
      }, delay);
    };
    const loaded = () => {
      if (decoding || disposed || ready.has(tile)) return;
      if (!image.naturalWidth) { failed(); return; }
      // Previously displayed native pixels can be reused without re-animation.
      if (nativeReady) { finish(); return; }
      decoding = true;
      const attempt = generation;
      Promise.resolve().then(() => image.decode?.()).then(() => {
        if (attempt === generation && image.naturalWidth) finish();
      }, () => { if (attempt === generation) failed(); });
    };
    cleanups.push(cleanup);
    begin.push(() => { if (image.complete) loaded(); });
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    image.loading = 'eager';
    image.decoding = 'async';
    watch();
  });
  begin.forEach((check) => check());
  release();
  return dispose;
}

/** Run before the main UI chunk: cached walls must not wait for page widgets. */
export function installAchievementWallReadiness(doc: Document = document) {
  const bind = () => doc.querySelectorAll<HTMLElement>('[data-achievement-wall]').forEach((root) => {
    const dispose = prepareAchievementWall(root);
    doc.defaultView?.addEventListener('pagehide', (event) => {
      if (!(event as PageTransitionEvent).persisted) dispose();
    }, { once: true });
  });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
}
