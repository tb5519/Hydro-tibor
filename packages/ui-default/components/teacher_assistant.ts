interface Position { x: number; y: number }

const installations = new WeakMap<HTMLElement, () => void>();

/** The server owns visibility and link permissions; this module only manages the floating UI. */
export function installTeacherAssistant(root: Document = document) {
  const host = root.querySelector<HTMLElement>('[data-teacher-assistant]');
  const view = root.defaultView;
  if (!host || !view) return undefined;
  if (installations.has(host)) return installations.get(host);
  const toggle = host.querySelector<HTMLButtonElement>('[data-assistant-toggle]');
  const panel = host.querySelector<HTMLElement>('[data-assistant-panel]');
  if (!toggle || !panel) return undefined;
  const storageKey = `onebyone.teacher-assistant.position.v1:${host.dataset.userId}`;
  const edge = 12;
  const listeners: (() => void)[] = [];
  let opened = false;
  let suppressClick = false;
  let suppressTimer: number;
  let frame = 0;
  let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean; position: Position } | undefined;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const viewport = () => ({
    left: view.visualViewport?.offsetLeft || 0,
    top: view.visualViewport?.offsetTop || 0,
    width: view.visualViewport?.width || view.innerWidth,
    height: view.visualViewport?.height || view.innerHeight,
  });
  function bounds() {
    const area = viewport();
    return {
      left: area.left + edge,
      top: area.top + edge,
      width: Math.max(0, area.width - toggle.offsetWidth - edge * 2),
      height: Math.max(0, area.height - toggle.offsetHeight - edge * 2),
    };
  }
  function defaultPosition(): Position {
    const area = bounds();
    return { x: 1, y: area.height ? clamp(1 - 84 / area.height, 0, 1) : 1 };
  }
  host.hidden = false;
  let position = defaultPosition();
  try {
    const saved = JSON.parse(view.localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved.x === 'number' && Number.isFinite(saved.x)
      && typeof saved.y === 'number' && Number.isFinite(saved.y)) {
      position = { x: clamp(saved.x, 0, 1), y: clamp(saved.y, 0, 1) };
    }
  } catch { /* Browser storage may be unavailable; dragging still works. */ }
  function persist() {
    try { view.localStorage.setItem(storageKey, JSON.stringify(position)); } catch { /* Keep the current session usable. */ }
  }
  function placePanel() {
    if (!opened) return;
    const area = viewport();
    const anchor = toggle.getBoundingClientRect();
    panel.style.maxHeight = `${Math.max(0, area.height - edge * 2)}px`;
    panel.style.width = `${Math.min(288, Math.max(0, area.width - edge * 2))}px`;
    const height = panel.offsetHeight;
    const width = panel.offsetWidth;
    const left = clamp(anchor.right - width, area.left + edge, area.left + area.width - width - edge);
    const above = anchor.top - height - 12;
    const below = anchor.bottom + 12;
    const top = above >= area.top + edge ? above : below;
    panel.style.left = `${left}px`;
    panel.style.top = `${clamp(top, area.top + edge, area.top + area.height - height - edge)}px`;
  }
  function place() {
    const area = bounds();
    host.style.left = `${Math.round(area.left + position.x * area.width)}px`;
    host.style.top = `${Math.round(area.top + position.y * area.height)}px`;
    placePanel();
  }
  function schedulePlace() {
    if (frame) return;
    frame = view.requestAnimationFrame(() => { frame = 0; place(); });
  }
  function setOpen(value: boolean, focus = false) {
    opened = value;
    panel.hidden = !value;
    toggle.setAttribute('aria-expanded', String(value));
    host.classList.toggle('is-open', value);
    if (value) {
      placePanel();
      if (focus) panel.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true });
    } else if (focus) toggle.focus({ preventScroll: true });
  }
  function on(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, listener, options);
    listeners.push(() => target.removeEventListener(type, listener, options));
  }
  on(toggle, 'pointerdown', ((event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    view.clearTimeout(suppressTimer);
    suppressClick = false;
    const rect = toggle.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false, position: { ...position } };
    toggle.setPointerCapture(event.pointerId);
  }) as EventListener);
  on(toggle, 'pointermove', ((event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    suppressClick = true;
    setOpen(false);
    host.classList.add('is-dragging');
    const area = bounds();
    position = {
      x: area.width ? clamp((drag.left + dx - area.left) / area.width, 0, 1) : 0,
      y: area.height ? clamp((drag.top + dy - area.top) / area.height, 0, 1) : 0,
    };
    place();
  }) as EventListener);
  function finishDrag(event: PointerEvent, cancelled = false) {
    if (!drag || drag.id !== event.pointerId) return;
    const current = drag;
    drag = undefined;
    host.classList.remove('is-dragging');
    if (cancelled) { position = current.position; place(); }
    else if (current.moved) persist();
    if (toggle.hasPointerCapture(event.pointerId)) toggle.releasePointerCapture(event.pointerId);
    if (current.moved) suppressTimer = view.setTimeout(() => { suppressClick = false; }, 400);
  }
  on(toggle, 'pointerup', ((event: PointerEvent) => finishDrag(event)) as EventListener);
  on(toggle, 'pointercancel', ((event: PointerEvent) => finishDrag(event, true)) as EventListener);
  on(toggle, 'lostpointercapture', ((event: PointerEvent) => finishDrag(event, true)) as EventListener);
  on(toggle, 'click', (event) => {
    if (suppressClick && (event as MouseEvent).detail !== 0) { event.preventDefault(); suppressClick = false; return; }
    setOpen(!opened, true);
  });
  on(toggle, 'keydown', ((event: KeyboardEvent) => {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const area = bounds();
    const step = event.shiftKey ? 48 : 16;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    position = { x: clamp(position.x + dx / (area.width || 1), 0, 1), y: clamp(position.y + dy / (area.height || 1), 0, 1) };
    place();
    persist();
  }) as EventListener);
  const close = host.querySelector('[data-assistant-close]');
  const reset = host.querySelector('[data-assistant-reset]');
  if (close) on(close, 'click', () => setOpen(false, true));
  if (reset) on(reset, 'click', () => { position = defaultPosition(); persist(); place(); });
  on(root, 'pointerdown', (event) => { if (opened && !host.contains(event.target as Node)) setOpen(false); });
  on(root, 'focusin', (event) => { if (opened && !host.contains(event.target as Node)) setOpen(false); });
  on(root, 'keydown', ((event: KeyboardEvent) => {
    if (event.key === 'Escape' && opened) { event.preventDefault(); setOpen(false, true); }
  }) as EventListener);
  on(view, 'resize', schedulePlace);
  if (view.visualViewport) {
    on(view.visualViewport, 'resize', schedulePlace);
    on(view.visualViewport, 'scroll', schedulePlace);
  }
  on(view, 'pagehide', () => setOpen(false));
  // Clicking into the Scratch iframe does not bubble a pointer event to this document.
  on(view, 'blur', () => setOpen(false));
  place();
  const dispose = () => {
    listeners.forEach((remove) => remove());
    view.cancelAnimationFrame(frame);
    view.clearTimeout(suppressTimer);
    setOpen(false);
    host.hidden = true;
    installations.delete(host);
  };
  installations.set(host, dispose);
  return dispose;
}
