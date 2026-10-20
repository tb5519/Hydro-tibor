/** Progressively replaces badge labels; broken or unsupported images keep the original badge. */
export function installBadgeIcons(root: Document = document) {
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
  const apply = (image: HTMLImageElement, ready: boolean) => {
    if (!image.matches('[data-badge-icon]')) return;
    const badge = image.parentElement;
    if (!badge) return;
    const valid = ready && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    image.hidden = !valid;
    badge.dataset.badgeIconState = valid ? 'ready' : 'fallback';
    const fallback = badge.querySelector<HTMLElement>('[data-badge-icon-fallback]');
    if (fallback) fallback.setAttribute('aria-hidden', valid ? 'true' : 'false');
    syncShimmer(image, valid);
  };
  const scan = (node: ParentNode) => {
    node.querySelectorAll<HTMLImageElement>('[data-badge-icon]').forEach((image) => apply(image, image.complete));
  };
  const load = (event: Event) => {
    if (event.target instanceof HTMLImageElement) apply(event.target, true);
  };
  const error = (event: Event) => {
    if (event.target instanceof HTMLImageElement) apply(event.target, false);
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
        if (image.matches('[data-badge-icon]')) apply(image, image.complete);
        continue;
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('[data-badge-icon]')) apply(node as HTMLImageElement, (node as HTMLImageElement).complete);
        scan(node);
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('[data-badge-icon]') && !root.contains(node)) removeShimmer(node as HTMLImageElement);
        node.querySelectorAll<HTMLImageElement>('[data-badge-icon]').forEach((image) => {
          if (!root.contains(image)) removeShimmer(image);
        });
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'sizes'] });
  return () => {
    root.removeEventListener('load', load, true);
    root.removeEventListener('error', error, true);
    root.removeEventListener('visibilitychange', syncVisibility);
    observer.disconnect();
    visibility?.disconnect();
    for (const shimmer of shimmers.values()) shimmer.remove();
    shimmers.clear();
  };
}
