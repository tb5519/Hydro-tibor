const pendingWalls = new WeakMap<HTMLElement, () => void>();

function useFallback(image: HTMLImageElement) {
  image.hidden = true;
  const tile = image.closest<HTMLElement>('[data-achievement-tile]');
  if (!tile || tile.querySelector('.achievement-wall__placeholder')) return;
  tile.classList.add('achievement-wall__item--placeholder');
  const star = image.ownerDocument.createElement('span');
  star.className = 'achievement-wall__placeholder'; star.textContent = '✦'; star.setAttribute('aria-hidden', 'true');
  const name = image.ownerDocument.createElement('span');
  name.className = 'achievement-wall__fallback-name'; name.textContent = tile.dataset.name || ''; name.setAttribute('aria-hidden', 'true');
  tile.append(star, name);
}

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

/** Cached thumbnails show immediately; new thumbnails grow the wall as each is ready. */
export function prepareAchievementWall(root: HTMLElement, timeoutMs = 8000) {
  const existing = pendingWalls.get(root);
  if (existing) return existing;
  const win = root.ownerDocument.defaultView!;
  const history = imageHistory(win);
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const tiles = Array.from(root.querySelectorAll<HTMLElement>('[data-achievement-tile]'));
  const count = root.querySelector<HTMLElement>('[data-achievement-count]');
  const grid = root.querySelector<HTMLElement>('.achievement-wall__grid');
  const hint = root.querySelector<HTMLElement>('[data-achievement-hint]');
  const pending = new Map<HTMLImageElement, (success: boolean) => void>();
  const shown = new Set<HTMLElement>();
  const queue: HTMLElement[] = [];
  const cleanups: Array<() => void> = [];
  const animationTimers = new Set<number>();
  let disposed = false;
  let timeout: number | undefined;
  let revealTimer: number | undefined;
  let countTimer: number | undefined;
  let nextRevealAt = 0;
  root.removeAttribute('data-achievement-wall-loading');
  root.setAttribute('aria-busy', 'true');
  root.classList.remove('is-ready');
  if (count) count.textContent = '0';
  grid?.setAttribute('data-achievement-grid-empty', '');
  if (hint) hint.hidden = true;

  const settled = () => {
    if (pending.size) return;
    win.clearTimeout(timeout);
    if (queue.length) return;
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
      count.textContent = String(shown.size);
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
  const arrive = (tile: HTMLElement, instant: boolean) => {
    if (instant || reducedMotion) show(tile, false);
    else {
      queue.push(tile);
      if (revealTimer === undefined) revealNext();
    }
    settled();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    win.clearTimeout(timeout); win.clearTimeout(revealTimer); win.clearTimeout(countTimer);
    animationTimers.forEach((timer) => win.clearTimeout(timer));
    cleanups.forEach((cleanup) => cleanup());
    tiles.forEach((tile) => tile.classList.remove('is-entering'));
    count?.classList.remove('is-counting');
    pending.clear(); queue.length = 0;
    pendingWalls.delete(root);
  };
  pendingWalls.set(root, dispose);

  const begin: Array<() => void> = [];
  tiles.forEach((tile) => {
    tile.classList.remove('is-entering');
    const image = tile.querySelector<HTMLImageElement>('img');
    if (!image || image.hidden) { show(tile, false); return; }
    // A loaded native image is already paintable. Do not decode or fade it again.
    if (image.complete && image.naturalWidth > 0) {
      rememberImage(win, image.src, true);
      show(tile, false);
      return;
    }
    tile.setAttribute('data-achievement-pending', '');
    const previouslyLoaded = history.has(image.src);
    let decoding = false;
    const cleanup = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
    const finish = (success: boolean) => {
      if (disposed || !pending.has(image)) return;
      cleanup();
      rememberImage(win, image.src, success);
      if (!success) useFallback(image);
      pending.delete(image);
      arrive(tile, previouslyLoaded);
    };
    const failed = () => finish(false);
    const loaded = () => {
      if (decoding || disposed || !pending.has(image)) return;
      if (!image.naturalWidth) { failed(); return; }
      // History suppresses repeat animation, not the actual load readiness check.
      if (previouslyLoaded) { finish(true); return; }
      decoding = true;
      Promise.resolve().then(() => image.decode?.()).then(() => finish(true), failed);
    };
    pending.set(image, finish);
    cleanups.push(cleanup);
    begin.push(() => { if (image.complete) loaded(); });
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    image.loading = 'eager';
    image.decoding = 'async';
  });
  if (pending.size) timeout = win.setTimeout(() => Array.from(pending.values()).forEach((finish) => finish(false)), timeoutMs);
  begin.forEach((check) => check());
  settled();
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
