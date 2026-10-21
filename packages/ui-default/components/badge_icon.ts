// Retain only confirmed ready URLs for this page/PJAX lifetime. Historical
// sessionStorage entries cannot prove that a bitmap is still in browser cache.
const readySources = new Set<string>();
function rememberReady(source: string) {
  readySources.delete(source);
  readySources.add(source);
  if (readySources.size > 256) readySources.delete(readySources.values().next().value!);
}

/** Hide pending artwork, reveal cold images gently, and reuse ready artwork immediately. */
export function installBadgeIcons(root: Document = document) {
  type ImageState = { key: string; phase: 'loading' | 'decoding' | 'ready' | 'fallback'; pending: boolean };
  const states = new WeakMap<HTMLImageElement, ImageState>();
  let disposed = false;
  const shimmers = new Map<HTMLImageElement, HTMLImageElement>();
  const visible = new WeakMap<HTMLImageElement, boolean>();
  const syncPlayback = (image: HTMLImageElement) => {
    const shimmer = shimmers.get(image);
    if (shimmer) shimmer.style.animationPlayState = root.hidden || !visible.get(image) ? 'paused' : 'running';
  };
  const VisibilityObserver = root.defaultView?.IntersectionObserver;
  const visibility = VisibilityObserver ? new VisibilityObserver((entries) => {
    for (const entry of entries) {
      const image = entry.target as HTMLImageElement;
      visible.set(image, entry.isIntersecting);
      syncPlayback(image);
    }
  }, { rootMargin: '32px 0px' }) : null;
  const removeShimmer = (image: HTMLImageElement) => {
    shimmers.get(image)?.remove();
    shimmers.delete(image);
    visibility?.unobserve(image);
  };
  const syncShimmer = (image: HTMLImageElement, ready: boolean) => {
    const badge = image.parentElement;
    if (!ready || !badge?.matches('.user-profile-badge')) { removeShimmer(image); return; }
    const source = image.currentSrc || image.src;
    if (!source) { removeShimmer(image); return; }
    let shimmer = shimmers.get(image);
    if (shimmer && (shimmer.parentElement !== badge || shimmer.getAttribute('src') !== source)) {
      removeShimmer(image);
      shimmer = undefined;
    }
    if (!shimmer) {
      // Use the bitmap's own alpha, not an external URL mask. Decorative media
      // redirects to a CDN, whose CORS policy can prevent a URL mask in Safari.
      shimmer = root.createElement('img');
      shimmer.dataset.badgeIconShine = '';
      shimmer.alt = '';
      shimmer.setAttribute('aria-hidden', 'true');
      shimmer.draggable = false;
      shimmer.decoding = 'async';
      shimmer.setAttribute('fetchpriority', 'low');
      shimmer.addEventListener('error', () => {
        if (shimmers.get(image) === shimmer) removeShimmer(image);
      }, { once: true });
      if (image.hasAttribute('crossorigin')) shimmer.crossOrigin = image.crossOrigin;
      if (image.referrerPolicy) shimmer.referrerPolicy = image.referrerPolicy;
      shimmer.src = source;
      // Different designs do not all flash together; repeated copies of one
      // badge retain a consistent phase when a live ranking inserts new rows.
      const phase = Array.from(source).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0) % 4800;
      shimmer.style.animationDelay = `-${phase}ms`;
      shimmers.set(image, shimmer);
      visible.set(image, !visibility);
      badge.append(shimmer);
      visibility?.observe(image);
    }
    syncPlayback(image);
  };
  const requestKey = (image: HTMLImageElement) => [image.src, image.srcset, image.sizes, image.currentSrc || image.src].join('\n');
  const validImage = (image: HTMLImageElement) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  const apply = (image: HTMLImageElement, event: 'scan' | 'load' | 'error') => {
    if (!image.matches('[data-badge-icon]')) return;
    const badge = image.parentElement;
    if (!badge) return;
    image.dataset.badgeIconManaged = '';
    if (!image.hasAttribute('fetchpriority')) image.setAttribute('fetchpriority', 'high');
    image.loading = 'eager';
    const key = requestKey(image);
    let state = states.get(image);
    if (!state || state.key !== key) {
      state = { key, phase: 'loading', pending: event !== 'scan' || !validImage(image) };
      states.set(image, state);
      delete badge.dataset.badgeIconReveal;
      removeShimmer(image);
    }
    const fallback = badge.querySelector<HTMLElement>('[data-badge-icon-fallback]');
    const fail = () => {
      state.phase = 'fallback';
      image.hidden = true;
      badge.dataset.badgeIconState = 'fallback';
      badge.removeAttribute('aria-busy');
      delete badge.dataset.badgeIconReveal;
      fallback?.setAttribute('aria-hidden', 'false');
      removeShimmer(image);
    };
    if (event === 'error' || (image.complete && !validImage(image))) { fail(); return; }
    if (state.phase === 'ready' && validImage(image)) { syncShimmer(image, true); return; }
    if (state.phase === 'decoding') return;
    const source = image.currentSrc || image.src;
    const immediate = readySources.has(source) || (event === 'scan' && !state.pending);
    const reveal = () => {
      // A late decode must not reveal a replaced, removed, or disposed icon.
      if (disposed || states.get(image) !== state || requestKey(image) !== key || !root.contains(image)) return;
      if (!validImage(image)) { fail(); return; }
      state.phase = 'ready';
      rememberReady(source);
      image.hidden = false;
      badge.dataset.badgeIconState = 'ready';
      badge.removeAttribute('aria-busy');
      fallback?.setAttribute('aria-hidden', 'true');
      if (!immediate) badge.dataset.badgeIconReveal = 'fade';
      else delete badge.dataset.badgeIconReveal;
      syncShimmer(image, true);
    };
    if (validImage(image) && immediate) { reveal(); return; }
    image.hidden = true;
    badge.dataset.badgeIconState = 'loading';
    badge.setAttribute('aria-busy', 'true');
    fallback?.setAttribute('aria-hidden', 'true');
    removeShimmer(image);
    state.pending = true;
    if (!validImage(image)) return;
    state.phase = 'decoding';
    // Cached complete bitmaps need no transition. New downloads wait for
    // decoding, preventing an empty first animation frame in Safari.
    if (typeof image.decode === 'function') {
      try { void image.decode().then(reveal, reveal); } catch { reveal(); }
    } else reveal();
  };
  const scan = (node: ParentNode) => {
    node.querySelectorAll<HTMLImageElement>('[data-badge-icon]').forEach((image) => apply(image, 'scan'));
  };
  const load = (event: Event) => {
    if (event.target instanceof HTMLImageElement) apply(event.target, 'load');
  };
  const error = (event: Event) => {
    if (event.target instanceof HTMLImageElement) apply(event.target, 'error');
  };
  root.addEventListener('load', load, true);
  root.addEventListener('error', error, true);
  const syncVisibility = () => { for (const image of shimmers.keys()) syncPlayback(image); };
  root.addEventListener('visibilitychange', syncVisibility);
  scan(root);
  // Cached images inserted by dialogs, live rankings, or PJAX may have loaded before insertion.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const image = record.target as HTMLImageElement;
        // Switching artwork must first remove the old glow. The load event
        // re-enables it after the replacement image has actually loaded.
        if (image.matches('[data-badge-icon]')) apply(image, 'scan');
        continue;
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('[data-badge-icon]')) apply(node as HTMLImageElement, 'scan');
        scan(node);
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('[data-badge-icon]') && !root.contains(node)) {
          states.delete(node as HTMLImageElement);
          node.removeAttribute('data-badge-icon-managed');
          removeShimmer(node as HTMLImageElement);
        }
        node.querySelectorAll<HTMLImageElement>('[data-badge-icon]').forEach((image) => {
          if (!root.contains(image)) {
            states.delete(image);
            image.removeAttribute('data-badge-icon-managed');
            removeShimmer(image);
          }
        });
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'sizes'] });
  return () => {
    disposed = true;
    root.removeEventListener('load', load, true);
    root.removeEventListener('error', error, true);
    root.removeEventListener('visibilitychange', syncVisibility);
    observer.disconnect();
    visibility?.disconnect();
    root.querySelectorAll('[data-badge-icon-managed]').forEach((image) => image.removeAttribute('data-badge-icon-managed'));
    for (const shimmer of shimmers.values()) shimmer.remove();
    shimmers.clear();
  };
}
