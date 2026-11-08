interface Position { x: number; y: number }
interface Drag { id: number; x: number; y: number; left: number; top: number; moved: boolean }

/** Keep the conversation where its owner put it, including after zoom or a soft keyboard opens. */
export function installChatPanelDrag(panel: HTMLElement, handle: HTMLElement, uid: number, signal?: AbortSignal) {
  const win = panel.ownerDocument.defaultView!;
  const viewport = win.visualViewport;
  const key = `onebyone.class-chat.panel-position.v1:${uid}`;
  const properties = ['left', 'top', 'right', 'bottom', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight', 'boxSizing'] as const;
  const original = Object.fromEntries(properties.map((property) => [property, panel.style[property]]));
  const originalDraggable = handle.getAttribute('data-chat-panel-draggable');
  let disposed = false; let frame = 0; let drag: Drag | null = null;
  let preferred: Position | null = null; let mobile = false;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  try {
    const saved = JSON.parse(win.localStorage.getItem(key) || 'null');
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) preferred = { x: clamp(saved.x, 0, 1), y: clamp(saved.y, 0, 1) };
  } catch { /* Private browsing or damaged preferences must not prevent chatting. */ }

  function bounds() {
    const width = viewport?.width || win.innerWidth; const height = viewport?.height || win.innerHeight;
    const edge = Math.min(12, width / 10, height / 10);
    return { left: (viewport?.offsetLeft || 0) + edge, top: (viewport?.offsetTop || 0) + edge,
      width: Math.max(1, width - edge * 2), height: Math.max(1, height - edge * 2), viewportWidth: width };
  }

  function geometry() {
    const view = bounds();
    return { ...view, travelX: Math.max(0, view.width - panel.offsetWidth), travelY: Math.max(0, view.height - panel.offsetHeight) };
  }

  function place(left: number, top: number) {
    const area = geometry();
    const x = clamp(left, area.left, area.left + area.travelX); const y = clamp(top, area.top, area.top + area.travelY);
    panel.style.left = `${x}px`; panel.style.top = `${y}px`;
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
    if (drag) { drag.left = x; drag.top = y; }
  }

  function refresh() {
    if (disposed) return;
    if (panel.hidden || !panel.getClientRects().length) { endDrag(); return; }
    const view = bounds();
    // The stylesheet's minimum height must not push the composer underneath the keyboard.
    panel.style.boxSizing = 'border-box'; panel.style.minWidth = '0'; panel.style.minHeight = '0';
    panel.style.maxWidth = `${view.width}px`; panel.style.maxHeight = `${view.height}px`;
    const area = geometry();
    mobile = area.viewportWidth <= 640 && panel.offsetWidth >= area.viewportWidth - 40;
    handle.dataset.chatPanelDraggable = mobile ? 'false' : 'true';
    if (mobile && drag) endDrag();
    if (!preferred && !mobile) {
      const rect = panel.getBoundingClientRect();
      preferred = { x: area.travelX ? clamp((rect.left - area.left) / area.travelX, 0, 1) : 1,
        y: area.travelY ? clamp((rect.top - area.top) / area.travelY, 0, 1) : 1 };
    }
    if (drag) place(drag.left, drag.top);
    else {
      const position = mobile ? { x: 1, y: 1 } : preferred || { x: 1, y: 1 };
      place(area.left + area.travelX * position.x, area.top + area.travelY * position.y);
    }
  }

  function schedule() {
    if (!disposed && !frame) frame = win.requestAnimationFrame(() => { frame = 0; refresh(); });
  }

  function endDrag() {
    if (!drag) return;
    const finished = drag; drag = null;
    panel.classList.remove('is-dragging');
    try { if (handle.hasPointerCapture(finished.id)) handle.releasePointerCapture(finished.id); } catch { /* Detached handle. */ }
    if (finished.moved && !mobile) {
      const area = geometry();
      preferred = { x: area.travelX ? clamp((finished.left - area.left) / area.travelX, 0, 1) : preferred?.x ?? 1,
        y: area.travelY ? clamp((finished.top - area.top) / area.travelY, 0, 1) : preferred?.y ?? 1 };
      try { win.localStorage.setItem(key, JSON.stringify(preferred)); } catch { /* Dragging still works without storage. */ }
    }
  }

  function pointerDown(event: PointerEvent) {
    if (disposed || drag || event.button !== 0 || !event.isPrimary) return;
    const target = event.target as Element | null;
    if (!target?.closest || target.closest('button,a,input,textarea,select,summary,[role="button"],[contenteditable]:not([contenteditable="false"]),[data-no-drag]')) return;
    refresh();
    if (mobile || panel.hidden) return;
    const rect = panel.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    panel.classList.add('is-dragging');
    event.preventDefault();
    try { handle.setPointerCapture(event.pointerId); } catch { /* Window listeners also handle older WebViews. */ }
  }

  function pointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id || disposed) return;
    const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true; drag.x = event.clientX; drag.y = event.clientY;
    place(drag.left + dx, drag.top + dy);
    event.preventDefault();
  }

  function pointerEnd(event: PointerEvent) { if (drag?.id === event.pointerId) endDrag(); }
  const mutation = new MutationObserver(schedule);
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  function dispose() {
    if (disposed) return;
    disposed = true; endDrag(); win.cancelAnimationFrame(frame);
    mutation.disconnect(); resize?.disconnect();
    handle.removeEventListener('pointerdown', pointerDown);
    handle.removeEventListener('lostpointercapture', pointerEnd);
    win.removeEventListener('pointermove', pointerMove);
    win.removeEventListener('pointerup', pointerEnd); win.removeEventListener('pointercancel', pointerEnd);
    win.removeEventListener('resize', schedule);
    viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
    signal?.removeEventListener('abort', dispose);
    for (const property of properties) panel.style[property] = original[property];
    if (originalDraggable === null) handle.removeAttribute('data-chat-panel-draggable');
    else handle.setAttribute('data-chat-panel-draggable', originalDraggable);
  }
  if (signal?.aborted) { disposed = true; return { refresh, dispose }; }
  mutation.observe(panel, { attributes: true, attributeFilter: ['hidden', 'class'] }); resize?.observe(panel);
  handle.addEventListener('pointerdown', pointerDown);
  handle.addEventListener('lostpointercapture', pointerEnd);
  win.addEventListener('pointermove', pointerMove, { passive: false });
  win.addEventListener('pointerup', pointerEnd); win.addEventListener('pointercancel', pointerEnd);
  win.addEventListener('resize', schedule);
  viewport?.addEventListener('resize', schedule); viewport?.addEventListener('scroll', schedule);
  signal?.addEventListener('abort', dispose, { once: true });
  schedule();
  return { refresh, dispose };
}
