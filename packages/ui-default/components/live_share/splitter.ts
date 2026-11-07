/** Only the two existing scratchpad split layouts accept remote resize commands. */
export const SHARED_SPLIT_SELECTOR = '#scratchpad .live-share-split-columns, #scratchpad .live-share-split-rows';
const RESIZE_EVENT = 'live-share:scratchpad-resize';
export function sharedSash(target: Element | null): HTMLElement | null {
  const sash = target?.closest<HTMLElement>('.sash');
  const split = sash?.closest<HTMLElement>(SHARED_SPLIT_SELECTOR);
  return sash && split && !sash.matches('.sash-disabled')
    && sash.parentElement?.parentElement === split ? sash : null;
}
export function resizeSharedSash(sash: HTMLElement, position: number): boolean {
  if (sharedSash(sash) !== sash || !Number.isFinite(position) || position < 0 || position > 1) return false;
  const split = sash.closest<HTMLElement>(SHARED_SPLIT_SELECTOR);
  const index = Array.from(sash.parentElement.children).indexOf(sash);
  if (index < 0 || index > 1) return false;
  const detail = { index, position, accepted: false };
  split.dispatchEvent(new CustomEvent(RESIZE_EVENT, { bubbles: true, detail }));
  return detail.accepted;
}

/** Use Allotment's sizing API, keeping its constraints and student drag behavior intact. */
export function attachSharedSplitter(root: HTMLElement, apply: (axis: 'columns' | 'rows', sizes: number[]) => void) {
  const resize = (event: Event) => {
    const split = event.target as HTMLElement;
    const detail = (event as CustomEvent).detail;
    if (!split?.matches(SHARED_SPLIT_SELECTOR) || !root.contains(split) || !detail
      || !Number.isSafeInteger(detail.index) || detail.index < 0 || detail.index > 1
      || !Number.isFinite(detail.position) || detail.position < 0 || detail.position > 1) return;
    const vertical = split.classList.contains('live-share-split-rows');
    const panes = Array.from(split.querySelectorAll<HTMLElement>(':scope > .split-view-container > .split-view-view'));
    if (panes.length !== 3 || detail.index >= panes.length - 1) return;
    const sizes = panes.map((pane) => {
      const bounds = pane.getBoundingClientRect();
      return vertical ? bounds.height : bounds.width;
    });
    const bounds = split.getBoundingClientRect();
    const total = vertical ? bounds.height : bounds.width;
    if (!(total > 0)) return;
    const index = detail.index;
    const before = sizes.slice(0, index).reduce((sum, size) => sum + size, 0);
    const pair = sizes[index] + sizes[index + 1];
    const first = Math.max(0, Math.min(pair, total * detail.position - before));
    sizes[index] = first; sizes[index + 1] = pair - first;
    apply(vertical ? 'rows' : 'columns', sizes);
    detail.accepted = true;
  };
  root.addEventListener(RESIZE_EVENT, resize);
  return () => root.removeEventListener(RESIZE_EVENT, resize);
}
