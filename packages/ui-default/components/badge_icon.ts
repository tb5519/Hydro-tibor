/** Progressively replaces badge labels; broken or unsupported images keep the original badge. */
export function installBadgeIcons(root: Document = document) {
  const apply = (image: HTMLImageElement, ready: boolean) => {
    if (!image.matches('[data-badge-icon]')) return;
    const badge = image.parentElement;
    if (!badge) return;
    const valid = ready && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    image.hidden = !valid;
    badge.dataset.badgeIconState = valid ? 'ready' : 'fallback';
    const fallback = badge.querySelector<HTMLElement>('[data-badge-icon-fallback]');
    if (fallback) fallback.setAttribute('aria-hidden', valid ? 'true' : 'false');
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
  scan(root);
  // Cached images inserted by dialogs, live rankings, or PJAX may have loaded before insertion.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('[data-badge-icon]')) apply(node as HTMLImageElement, (node as HTMLImageElement).complete);
        scan(node);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    root.removeEventListener('load', load, true);
    root.removeEventListener('error', error, true);
    observer.disconnect();
  };
}
