/** Temporary teacher marks use only learner viewport CSS pixels and plain points. */
export interface DrawingPacket {
  strokeId: string;
  phase: 'start' | 'move' | 'end';
  sequence: number;
  points: [number, number][];
}

const MAX_STROKES = 32;
const MAX_POINTS = 2048;
const MAX_PACKET_POINTS = 32;
const HOLD_MS = 5000;
const FADE_MS = 1000;
const IDLE_MS = 12000;
const namespace = 'http://www.w3.org/2000/svg';
type Point = [number, number];
type Stroke = { node: SVGGElement; paths: SVGPathElement[]; points: Point[]; sequence: number;
  ended: boolean; expiry: number; removal: number };

export function validDrawingPacket(value: any): value is DrawingPacket {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => ['strokeId', 'phase', 'sequence', 'points'].includes(key))
    && typeof value.strokeId === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(value.strokeId)
    && ['start', 'move', 'end'].includes(value.phase)
    && Number.isSafeInteger(value.sequence) && value.sequence >= 0 && value.sequence <= 4096
    && (value.phase !== 'start' || value.sequence === 0)
    && Array.isArray(value.points) && value.points.length <= MAX_PACKET_POINTS
    && (value.phase === 'end' || value.points.length > 0)
    && value.points.every((point: any) => Array.isArray(point) && point.length === 2
      && point.every((coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate)
        && coordinate >= 0 && coordinate <= 10000));
}

function pathFor(points: Point[]) {
  if (!points.length) return '';
  const [firstX, firstY] = points[0];
  if (points.length === 1) return `M ${firstX} ${firstY} l .01 0`;
  let path = `M ${firstX} ${firstY}`;
  for (let index = 1; index < points.length - 1; index++) {
    const [x, y] = points[index]; const next = points[index + 1];
    path += ` Q ${x} ${y} ${(x + next[0]) / 2} ${(y + next[1]) / 2}`;
  }
  const end = points[points.length - 1];
  return `${path} L ${end[0]} ${end[1]}`;
}

/** The container has the learner's viewport size, possibly scaled on the teacher side. */
export function attachTemporaryDrawing(options: {
  container: HTMLElement;
  teacher: boolean;
  pageId: string;
  /** Local teacher-only overlay can listen across its owner page rather than inside a mirrored stage. */
  scopeDocument?: boolean;
  send?: (packet: DrawingPacket) => void;
}) {
  const doc = options.container.ownerDocument;
  const win = doc.defaultView!;
  const layer = doc.createElementNS(namespace, 'svg');
  layer.dataset.liveShareUi = '';
  layer.dataset.liveSharePrivate = '';
  layer.dataset.shareDrawing = options.pageId;
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:2147482000';
  options.container.append(layer);
  const strokes = new Map<string, Stroke>();
  const seen = new Set<string>();
  const bound = new Map<Window, { document: Document; root: Element | null; unbind: () => void }>();
  const watchedFrames = new Map<HTMLIFrameElement, () => void>();
  const localFrames = new Map<HTMLIFrameElement, { channel: string; href: string; lastSent: number; loaded: () => void }>();
  let connected = true;
  let disposed = false;
  let flushTimer = 0;
  let scanTimer = 0;
  let active: { id: string; pointer: number; sequence: number; pending: Point[]; count: number; last: Point; started: number } | null = null;
  const now = () => win.performance.now();

  function remove(id: string) {
    const stroke = strokes.get(id);
    if (!stroke) return;
    win.clearTimeout(stroke.expiry); win.clearTimeout(stroke.removal);
    stroke.node.remove(); strokes.delete(id);
  }
  function fade(id: string, delay: number) {
    const stroke = strokes.get(id);
    if (!stroke) return;
    win.clearTimeout(stroke.expiry);
    stroke.expiry = win.setTimeout(() => {
      stroke.node.style.transition = `opacity ${FADE_MS}ms ease-out`;
      stroke.node.style.opacity = '0';
      stroke.removal = win.setTimeout(() => remove(id), FADE_MS);
    }, delay);
  }
  function receive(packet: DrawingPacket) {
    if (disposed || !connected || !validDrawingPacket(packet)) return;
    let stroke = strokes.get(packet.strokeId);
    if (packet.phase === 'start') {
      if (seen.has(packet.strokeId)) return;
      seen.add(packet.strokeId);
      if (seen.size > 128) seen.delete(seen.values().next().value!);
      if (strokes.size >= MAX_STROKES) remove(strokes.keys().next().value!);
      const node = doc.createElementNS(namespace, 'g');
      node.dataset.shareDrawingStroke = packet.strokeId;
      const paths = [6.5, 4].map((width, index) => {
        const path = doc.createElementNS(namespace, 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', index ? '#9272e5' : '#ffffff');
        path.setAttribute('stroke-width', String(width));
        path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('opacity', index ? '.96' : '.78');
        node.append(path); return path;
      });
      node.style.filter = 'drop-shadow(0 1px 3px #8061cd35)';
      layer.append(node);
      stroke = { node, paths, points: [], sequence: -1, ended: false, expiry: 0, removal: 0 };
      strokes.set(packet.strokeId, stroke);
    }
    if (!stroke || stroke.ended || packet.sequence !== stroke.sequence + 1
      || stroke.points.length + packet.points.length > MAX_POINTS) return;
    stroke.sequence = packet.sequence;
    for (const point of packet.points) stroke.points.push([point[0], point[1]]);
    const path = pathFor(stroke.points);
    for (const shape of stroke.paths) shape.setAttribute('d', path);
    stroke.ended = packet.phase === 'end';
    fade(packet.strokeId, stroke.ended ? HOLD_MS : IDLE_MS);
  }
  function send(packet: DrawingPacket) { options.send?.(packet); }
  function flush() {
    win.clearTimeout(flushTimer); flushTimer = 0;
    if (!active || !active.pending.length) return;
    const pending = active.pending.splice(0);
    for (let index = 0; index < pending.length; index += MAX_PACKET_POINTS) {
      send({ strokeId: active.id, phase: 'move', sequence: ++active.sequence, points: pending.slice(index, index + MAX_PACKET_POINTS) });
    }
  }
  function finish() {
    if (!active) return;
    flush();
    const packet: DrawingPacket = { strokeId: active.id, phase: 'end', sequence: ++active.sequence, points: [] };
    const stroke = strokes.get(active.id);
    if (stroke) { stroke.sequence = packet.sequence; stroke.ended = true; fade(active.id, HOLD_MS); }
    send(packet); active = null;
  }
  function pointFrom(event: MouseEvent, eventWindow: Window): Point | null {
    let x = event.clientX; let y = event.clientY; let current = eventWindow;
    try {
      for (let depth = 0; current !== win && depth < 8; depth++) {
        const frame = current.frameElement as HTMLIFrameElement | null;
        if (!frame?.isConnected) return null;
        const bounds = frame.getBoundingClientRect();
        const scaleX = bounds.width / (frame.offsetWidth || 1); const scaleY = bounds.height / (frame.offsetHeight || 1);
        x = bounds.left + (frame.clientLeft + x) * scaleX;
        y = bounds.top + (frame.clientTop + y) * scaleY;
        current = frame.ownerDocument.defaultView!;
      }
      if (current !== win) return null;
      const bounds = options.container.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return null;
      x = (x - bounds.left) * options.container.clientWidth / bounds.width;
      y = (y - bounds.top) * options.container.clientHeight / bounds.height;
      return [Math.round(Math.max(0, Math.min(options.container.clientWidth, x)) * 10) / 10,
        Math.round(Math.max(0, Math.min(options.container.clientHeight, y)) * 10) / 10];
    } catch { return null; }
  }
  function within(event: Event, eventWindow: Window) {
    if (eventWindow === win) return !!options.scopeDocument || options.container.contains(event.target as Node);
    try {
      let current = eventWindow;
      for (let depth = 0; depth < 8; depth++) {
        const frame = current.frameElement;
        if (!frame) return false;
        if (frame.ownerDocument === doc) return !!options.scopeDocument || options.container.contains(frame);
        current = frame.ownerDocument.defaultView!;
      }
    } catch { /* Opaque or external frames never grant remote event access. */ }
    return false;
  }
  function cancelEvent(event: Event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function bind(eventWindow: Window) {
    const down = (event: PointerEvent) => {
      if (event.button !== 2 || !connected || !within(event, eventWindow)) return;
      const point = pointFrom(event, eventWindow);
      if (!point) return;
      cancelEvent(event); finish();
      const id = Array.from(win.crypto.getRandomValues(new Uint8Array(12)), (value) => value.toString(16).padStart(2, '0')).join('');
      active = { id, pointer: event.pointerId, sequence: 0, pending: [], count: 1, last: point, started: now() };
      const packet: DrawingPacket = { strokeId: id, phase: 'start', sequence: 0, points: [point] };
      receive(packet); send(packet);
    };
    const move = (event: PointerEvent) => {
      if (!active || event.pointerId !== active.pointer) return;
      if (!(event.buttons & 2)) { finish(); return; }
      cancelEvent(event);
      const point = pointFrom(event, eventWindow);
      if (!point || Math.hypot(point[0] - active.last[0], point[1] - active.last[1]) < 1.25) return;
      if (active.count >= MAX_POINTS || now() - active.started > 30000) { finish(); return; }
      active.last = point; active.count++; active.pending.push(point);
      const stroke = strokes.get(active.id);
      if (stroke) {
        stroke.points.push(point);
        const path = pathFor(stroke.points); for (const shape of stroke.paths) shape.setAttribute('d', path);
        fade(active.id, IDLE_MS);
      }
      // Keep the local pen immediate; bound only the packets put on the wire.
      if (active.pending.length >= MAX_PACKET_POINTS) flush();
      else if (!flushTimer) flushTimer = win.setTimeout(flush, 32);
    };
    const up = (event: PointerEvent) => {
      if (!active || event.pointerId !== active.pointer || (event.type === 'pointerup' && event.button !== 2)) return;
      cancelEvent(event); finish();
    };
    const suppressMenu = (event: MouseEvent) => {
      if (connected && within(event, eventWindow) && (event.type === 'contextmenu' || event.button === 2)) cancelEvent(event);
    };
    const blur = () => {
      // Focus entering a child frame blurs its parent window. Only an actual
      // loss of browser/page focus should finish the current stroke.
      win.setTimeout(() => { if (!doc.hasFocus()) finish(); }, 0);
    };
    // Window capture runs before Blockly/Monaco's document handlers and leaves
    // left-click and code-editing events entirely untouched.
    eventWindow.addEventListener('pointerdown', down, true);
    eventWindow.addEventListener('pointermove', move, true);
    eventWindow.addEventListener('pointerup', up, true);
    eventWindow.addEventListener('pointercancel', up, true);
    eventWindow.addEventListener('contextmenu', suppressMenu, true);
    eventWindow.addEventListener('mousedown', suppressMenu, true);
    eventWindow.addEventListener('auxclick', suppressMenu, true);
    eventWindow.addEventListener('blur', blur);
    // A replay can replace its HTML root before iframe load fires. Observing
    // the Document catches document.open() in the same microtask, so the first
    // right drag on a newly visible page cannot fall between polling ticks.
    const documentObserver = eventWindow === win ? null : new win.MutationObserver(() => scan());
    documentObserver?.observe(eventWindow.document, { childList: true });
    bound.set(eventWindow, { document: eventWindow.document, root: eventWindow.document.documentElement, unbind: () => {
      documentObserver?.disconnect();
      try {
      eventWindow.removeEventListener('pointerdown', down, true);
      eventWindow.removeEventListener('pointermove', move, true);
      eventWindow.removeEventListener('pointerup', up, true);
      eventWindow.removeEventListener('pointercancel', up, true);
      eventWindow.removeEventListener('contextmenu', suppressMenu, true);
      eventWindow.removeEventListener('mousedown', suppressMenu, true);
      eventWindow.removeEventListener('auxclick', suppressMenu, true);
      eventWindow.removeEventListener('blur', blur);
      } catch { /* A former same-origin document may have navigated away. */ }
    } });
  }
  function postLocalFrame(frame: HTMLIFrameElement, channel: string, enabled: boolean) {
    try { frame.contentWindow?.postMessage({ type: 'live-share-local-drawing', channel, enabled }, '*'); }
    catch { /* A removed Scratch frame no longer needs its short-lived drawing lease. */ }
  }
  function localFrameInfo(frame: HTMLIFrameElement) {
    try {
      const url = new URL(frame.src, doc.URL);
      const channel = new URLSearchParams(url.hash.slice(1)).get('channel');
      const bounds = frame.getBoundingClientRect();
      if (url.origin !== new URL(doc.URL).origin || url.pathname !== '/scratch-editor/editor.html'
        || !channel || !/^[a-zA-Z0-9_-]{8,96}$/.test(channel)
        || !frame.sandbox.contains('allow-scripts') || frame.sandbox.contains('allow-same-origin')
        || !frame.isConnected || !bounds.width || !bounds.height) return null;
      return { href: url.href, channel };
    } catch { return null; }
  }
  function syncLocalFrames() {
    if (!options.scopeDocument || !options.teacher) return;
    for (const [frame, binding] of localFrames) {
      const current = localFrameInfo(frame);
      if (!current || current.href !== binding.href) {
        postLocalFrame(frame, binding.channel, false); frame.removeEventListener('load', binding.loaded); localFrames.delete(frame);
      }
    }
    if (!connected) return;
    for (const frame of doc.querySelectorAll<HTMLIFrameElement>('iframe[src]')) {
      const info = localFrameInfo(frame);
      if (!info) continue;
      let binding = localFrames.get(frame);
      if (!binding) {
        if (localFrames.size >= 4) continue;
        binding = { ...info, lastSent: -Infinity, loaded: () => {
          const current = localFrames.get(frame);
          if (!disposed && connected && current && localFrameInfo(frame)?.href === current.href) {
            current.lastSent = now(); postLocalFrame(frame, current.channel, true);
          }
        } };
        localFrames.set(frame, binding); frame.addEventListener('load', binding.loaded);
      }
      if (now() - binding.lastSent >= 4000) {
        binding.lastSent = now(); postLocalFrame(frame, binding.channel, true);
      }
    }
  }
  function scan() {
    if (disposed || !options.teacher) return;
    syncLocalFrames();
    const live = new Set<Window>([win]);
    const frames = new Set<HTMLIFrameElement>();
    const visit = (root: ParentNode, depth: number) => {
      if (depth > 5 || live.size >= 12) return;
      for (const frame of root.querySelectorAll<HTMLIFrameElement>('iframe')) {
        if (frames.size >= 12) break;
        frames.add(frame);
        if (!watchedFrames.has(frame)) {
          const loaded = () => scan();
          watchedFrames.set(frame, loaded); frame.addEventListener('load', loaded);
        }
        try {
          if (!frame.contentDocument || !frame.contentWindow || !frame.isConnected) continue;
          live.add(frame.contentWindow); visit(frame.contentDocument, depth + 1);
        } catch { /* External/opaque source frames are intentionally inaccessible. */ }
      }
    };
    visit(options.scopeDocument ? doc : options.container, 0);
    for (const eventWindow of live) {
      try {
        const old = bound.get(eventWindow);
        // rrweb uses document.open()/write(), which clears window listeners
        // without replacing the Document object. Its HTML root does change.
        if (!old || old.document !== eventWindow.document || old.root !== eventWindow.document.documentElement) {
          old?.unbind(); bind(eventWindow);
        }
      } catch { /* The frame may have navigated to an opaque document. */ }
    }
    for (const [eventWindow, binding] of bound) if (!live.has(eventWindow)) { binding.unbind(); bound.delete(eventWindow); }
    for (const [frame, loaded] of watchedFrames) if (!frames.has(frame)) { frame.removeEventListener('load', loaded); watchedFrames.delete(frame); }
  }
  function clear() {
    active = null; win.clearTimeout(flushTimer); flushTimer = 0;
    for (const id of [...strokes.keys()]) remove(id);
    seen.clear();
  }
  const observer = new win.MutationObserver(() => { if (!disposed) scan(); });
  if (options.teacher) {
    scan(); observer.observe(options.scopeDocument ? doc.documentElement : options.container, { childList: true, subtree: true });
    scanTimer = win.setInterval(scan, 200);
  }
  return {
    receive,
    setConnected(value: boolean) {
      connected = value;
      if (!value) {
        clear();
        for (const [frame, binding] of localFrames) { postLocalFrame(frame, binding.channel, false); binding.lastSent = -Infinity; }
      } else syncLocalFrames();
    },
    dispose() {
      if (disposed) return;
      disposed = true; connected = false; clear(); observer.disconnect(); win.clearInterval(scanTimer);
      for (const [frame, binding] of localFrames) { postLocalFrame(frame, binding.channel, false); frame.removeEventListener('load', binding.loaded); }
      localFrames.clear();
      for (const [frame, loaded] of watchedFrames) frame.removeEventListener('load', loaded);
      watchedFrames.clear();
      for (const binding of bound.values()) binding.unbind(); bound.clear(); layer.remove();
    },
  };
}
