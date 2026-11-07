import { isSharedPointerPrivate as isPrivate } from './pointer';
export interface BroadcastFocus { x: number; y: number; width: number; height: number }

/** A viewing hint only. It never changes the teacher's page or grants remote control. */
export function attachBroadcastFocus(send: (focus: BroadcastFocus) => void) {
  let connected = true; let disposed = false; let timer = 0; let initialTimer = 0;
  let last: BroadcastFocus | null = null; let lastKey = '';
  const cleanup: (() => void)[] = [];
  let visibleWindows = new Set<Element>();
  const visible = (rect: DOMRect) => rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
    && rect.left < innerWidth && rect.top < innerHeight;
  function publish(rect: BroadcastFocus) {
    if (!connected || disposed) return;
    const next = { x: Math.max(0, Math.min(innerWidth - 1, rect.x)), y: Math.max(0, Math.min(innerHeight - 1, rect.y)),
      width: Math.max(1, Math.min(innerWidth, rect.width)), height: Math.max(1, Math.min(innerHeight, rect.height)) };
    const key = JSON.stringify(next); if (key === lastKey) return;
    lastKey = key; last = next; send(next);
  }
  function initial() {
    if (last) { lastKey = ''; publish(last); return; }
    const selectors = ['.monaco-editor', '.problem-content .typo', '.problem-content', 'main', '.main .row', '.row'];
    for (const selector of selectors) {
      for (const node of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        if (isPrivate(node)) continue;
        const rect = node.getBoundingClientRect(); if (!visible(rect)) continue;
        // Start at the text/code, not the empty center of an ultrawide monitor.
        publish({ x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.min(900, rect.width), height: Math.min(420, rect.height) });
        return;
      }
    }
    publish({ x: 24, y: 24, width: Math.min(900, innerWidth - 24), height: Math.min(420, innerHeight - 24) });
  }
  function caret() {
    const active = document.activeElement as HTMLElement | null;
    if (isPrivate(active)) return;
    const editor = active?.closest('.monaco-editor');
    const cursor = editor?.querySelector<HTMLElement>('.cursor');
    const rect = cursor?.getBoundingClientRect();
    if (rect && visible(rect)) { publish({ x: rect.x, y: rect.y, width: Math.max(150, rect.width), height: rect.height }); return; }
    const selection = window.getSelection();
    if (selection?.rangeCount && selection.toString()) {
      const range = selection.getRangeAt(0); const element = range.commonAncestorContainer.parentElement;
      if (isPrivate(element || null)) return;
      const bounds = range.getBoundingClientRect();
      if (visible(bounds)) { publish({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }); return; }
    }
    if (active && active !== document.body) {
      const box = active.getBoundingClientRect();
      if (visible(box)) publish({ x: box.x, y: box.y, width: Math.min(box.width, 600), height: Math.min(box.height, 200) });
    }
  }
  function pointer(event: PointerEvent) {
    if (!event.isTrusted) return;
    clearTimeout(timer);
    if (isPrivate(event.target instanceof Element ? event.target : null)) return;
    const point = { x: Math.max(0, event.clientX - 35), y: Math.max(0, event.clientY - 25), width: 70, height: 50 };
    if (event.type === 'pointerdown') publish(point);
    else if (!event.buttons) timer = window.setTimeout(() => publish(point), 350);
  }
  function runtimeWindows() {
    const windows = [...document.querySelectorAll<HTMLElement>('[data-ide-runtime]:not([data-live-share-ui]) .ide-window:not([hidden])')]
      .filter((node) => !isPrivate(node) && visible(node.getBoundingClientRect()));
    const fresh = windows.filter((node) => !visibleWindows.has(node));
    visibleWindows = new Set(windows);
    const target = fresh.find((node) => node.classList.contains('is-front')) || fresh.at(-1);
    if (!target) return;
    // Follow a newly opened terminal/drawing window once, never on every output
    // line or animation frame. Later teacher gestures still take precedence.
    const rect = target.getBoundingClientRect(); publish({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }
  const key = (event: Event) => { if (!event.isTrusted) return; clearTimeout(timer); timer = window.setTimeout(caret, 60); };
  const selection = (event: Event) => { if (window.getSelection()?.toString()) key(event); };
  const resized = () => { last = null; lastKey = ''; clearTimeout(timer); timer = window.setTimeout(initial, 120); };
  const listen = (target: EventTarget, name: string, listener: EventListener) => {
    target.addEventListener(name, listener, true); cleanup.push(() => target.removeEventListener(name, listener, true));
  };
  listen(window, 'pointerdown', pointer as EventListener); listen(window, 'pointermove', pointer as EventListener);
  listen(window, 'keyup', key); listen(document, 'selectionchange', selection); listen(window, 'resize', resized);
  const windowsObserver = new MutationObserver(runtimeWindows);
  windowsObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  initialTimer = window.setTimeout(() => { runtimeWindows(); initial(); }, 150);
  return {
    captureFrame(data: any, map: (frameId: string, x: number, y: number) => { x: number; y: number } | null) {
      if (disposed || !connected || data?.type !== 'frame') return;
      const packet = data.packet;
      const events = packet?.type === 'rrweb' ? [packet.event] : packet?.type === 'rrweb-batch' && Array.isArray(packet.events) ? packet.events : [];
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event?.type !== 3 || event.data?.source !== 1 || !Array.isArray(event.data.positions)) continue;
        const lastPoint = event.data.positions.at(-1);
        if (!lastPoint || !Number.isFinite(lastPoint.x) || !Number.isFinite(lastPoint.y) || lastPoint.x < 0 || lastPoint.y < 0) { clearTimeout(timer); return; }
        const point = map(data.id, lastPoint.x, lastPoint.y);
        if (point) {
          clearTimeout(timer);
          timer = window.setTimeout(() => publish({ x: point.x - 35, y: point.y - 25, width: 70, height: 50 }), 350);
        }
        return;
      }
    },
    snapshot() { initial(); },
    setConnected(value: boolean) { connected = value; if (value) { lastKey = ''; initial(); } },
    dispose() { disposed = true; clearTimeout(timer); clearTimeout(initialTimer); windowsObserver.disconnect(); cleanup.forEach((fn) => fn()); },
  };
}
