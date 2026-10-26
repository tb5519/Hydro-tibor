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

/** Reveal a complete wall, including fallbacks, instead of painting thumbnails one by one. */
export function prepareAchievementWall(root: HTMLElement, timeoutMs = 8000) {
  const existing = pendingWalls.get(root);
  if (existing) return existing;
  const win = root.ownerDocument.defaultView!;
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('[data-achievement-tile] img'));
  const pending = new Map<HTMLImageElement, (success: boolean) => void>();
  let disposed = false;
  let timer: number | undefined;
  let frame: number | undefined;
  root.setAttribute('data-achievement-wall-loading', '');
  root.setAttribute('aria-busy', 'true');
  root.classList.remove('is-ready');
  const reveal = () => {
    if (disposed) return;
    root.removeAttribute('data-achievement-wall-loading');
    root.setAttribute('aria-busy', 'false');
    root.classList.add('is-ready');
  };
  const ready = () => {
    if (pending.size || disposed) return;
    win.clearTimeout(timer);
    // Allow the hidden state to paint even when every image was already cached.
    frame = win.requestAnimationFrame(() => { frame = win.requestAnimationFrame(reveal); });
  };
  const cleanups: Array<() => void> = [];
  const checkCached: Array<() => void> = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    win.clearTimeout(timer);
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    cleanups.forEach((cleanup) => cleanup());
    pending.clear();
    pendingWalls.delete(root);
  };
  pendingWalls.set(root, dispose);
  if (!images.length) { reveal(); return dispose; }

  images.forEach((image) => {
    let decoding = false;
    const cleanup = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
    const settle = (success: boolean) => {
      if (disposed || !pending.has(image)) return;
      cleanup();
      if (!success) useFallback(image);
      pending.delete(image);
      ready();
    };
    const failed = () => settle(false);
    const loaded = () => {
      if (decoding || disposed || !pending.has(image)) return;
      if (!image.naturalWidth) { failed(); return; }
      decoding = true;
      // decode() also waits for cached images to be ready for their first paint.
      Promise.resolve().then(() => image.decode?.()).then(() => settle(true), failed);
    };
    pending.set(image, settle);
    cleanups.push(cleanup);
    checkCached.push(() => { if (image.complete) loaded(); });
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    image.loading = 'eager';
    image.decoding = 'async';
  });
  timer = win.setTimeout(() => Array.from(pending.values()).forEach((settle) => settle(false)), timeoutMs);
  // Attach every listener before checking the cache so no completion can be missed.
  checkCached.forEach((check) => check());
  return dispose;
}
