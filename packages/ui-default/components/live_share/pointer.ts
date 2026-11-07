const sensitiveSurface = [
  '[data-private]', '[data-sensitive]', '[data-teacher-assistant]', '[data-voice-call-ui]', '[data-live-share-viewer]',
  '.teacher-assistant', '.teacher-broadcast-bar', '.teacher-broadcast-picker', '.live-share', '.live-share-shell',
  '.voice-call-card', '.voice-call-floating', '.voice-call-toast',
  'input[type="password"]', 'input[type="hidden"]', 'input[type="file"]',
  '[autocomplete="current-password"]', '[autocomplete="new-password"]', '[autocomplete="one-time-code"]',
  '[name*="token" i]', '[name*="password" i]', '[name*="secret" i]', '[name*="csrf" i]', '#secret', '#qrcode', '[name="tfa_code"]',
].join(',');
const privateLayer = '[data-live-share-private],[data-live-share-ui]';
const sharedLayer = '[data-ide-runtime]:not([data-live-share-ui]),.live-share-annotation-source,.live-share-code-focus-layer,[data-share-drawing-note]';

/** Coordinate hints share the same privacy boundary as the recorded page.
 * Separately relayed IDE/annotation layers are the only generic-layer exceptions;
 * a secret input or explicitly sensitive ancestor is never an exception. */
export function isSharedPointerPrivate(node: Element | null) {
  return !!node?.closest(sensitiveSurface) || (!!node?.closest(privateLayer) && !node.closest(sharedLayer));
}

/** Reuse rrweb's display-only mouse packets, including over separately mirrored
 * Monaco/runtime surfaces. A remote pointer never dispatches local mouse events. */
export function attachSourcePointer(options: {
  enabled: () => boolean;
  documentId: () => number;
  emit: (event: { type: number; timestamp: number; data: any }) => void;
}) {
  let disposed = false; let visible = false; let timer = 0; let lastSent = 0;
  let pending: { x: number; y: number } | null = null;
  const publish = (x: number, y: number) => {
    const id = options.documentId();
    if (disposed || !options.enabled() || !Number.isSafeInteger(id) || id < 1) return;
    lastSent = performance.now();
    options.emit({ type: 3, timestamp: Date.now(), data: { source: 1, positions: [{ id, x, y, timeOffset: 0 }] } });
  };
  const flush = () => {
    timer = 0;
    if (!pending) return;
    const point = pending; pending = null; publish(point.x, point.y);
  };
  const hide = () => {
    clearTimeout(timer); timer = 0; pending = null;
    if (!visible) return;
    visible = false; publish(-1, -1);
  };
  const move = (event: PointerEvent) => {
    if (!event.isTrusted || event.pointerType === 'touch' || !options.enabled() || document.hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    // Nested app documents have their own capture, and private controls should
    // not leave a misleading point over an empty redacted placeholder.
    const privateNode = isSharedPointerPrivate(target);
    if (privateNode || target?.matches('iframe,object,embed') || event.clientX < 0 || event.clientY < 0
      || event.clientX >= innerWidth || event.clientY >= innerHeight) { hide(); return; }
    visible = true; pending = { x: event.clientX, y: event.clientY };
    if (performance.now() - lastSent >= 40) { clearTimeout(timer); flush(); }
    else if (!timer) timer = window.setTimeout(flush, 40);
  };
  const out = (event: PointerEvent) => {
    if (!event.relatedTarget || (event.relatedTarget instanceof Element && event.relatedTarget.matches('iframe,object,embed'))) hide();
  };
  const over = (event: PointerEvent) => {
    // Chrome can enter a child browsing context without delivering a parent
    // pointermove, so clear the outer point at the frame boundary as well.
    if (event.target instanceof Element && event.target.matches('iframe,object,embed')) hide();
  };
  const visibility = () => { if (document.hidden) hide(); };
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerout', out, true);
  document.addEventListener('pointerover', over, true);
  window.addEventListener('blur', hide);
  document.addEventListener('visibilitychange', visibility);
  return {
    hide,
    dispose() {
      hide(); disposed = true;
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerout', out, true);
      document.removeEventListener('pointerover', over, true);
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}

export function attachRemotePointer(container: HTMLElement) {
  const point = document.createElement('span');
  point.className = 'live-share-remote-pointer';
  point.setAttribute('aria-hidden', 'true'); point.dataset.liveShareUi = '';
  point.style.cssText = 'position:absolute;pointer-events:none;z-index:2147482500;display:none';
  container.append(point);
  return {
    receive(positions: { x: number; y: number }[], viewport: { width: number; height: number }) {
      const last = positions.at(-1);
      const show = !!last && Number.isFinite(last.x) && Number.isFinite(last.y)
        && last.x >= 0 && last.y >= 0 && last.x < viewport.width && last.y < viewport.height;
      // Opaque iframe mouse events do not bubble into their parent document.
      // All captures describe the same physical source mouse, so activating a
      // child point also clears a stale parent/sibling point (and vice versa).
      if (show) for (const other of Array.from(container.ownerDocument.querySelectorAll<HTMLElement>('.live-share-remote-pointer'))) {
        if (other !== point) other.style.display = 'none';
      }
      point.style.display = show ? 'block' : 'none';
      if (show) { point.style.left = `${last.x}px`; point.style.top = `${last.y}px`; }
    },
    hide() { point.style.display = 'none'; },
    dispose() { point.remove(); },
  };
}
