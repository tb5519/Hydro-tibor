/** Temporary teacher marks use only learner viewport CSS pixels and plain points. */
export interface DrawingPacket {
  strokeId: string;
  phase: 'start' | 'move' | 'end' | 'note' | 'delete';
  sequence: number;
  points: [number, number][];
  note?: { text: string; x: number; y: number; width: number; height: number };
}

const MAX_STROKES = 32;
const MAX_POINTS = 2048;
const MAX_PACKET_POINTS = 32;
const HOLD_MS = 5000;
const FADE_MS = 1000;
const IDLE_MS = 12000;
const namespace = 'http://www.w3.org/2000/svg';
type Point = [number, number];
type Note = NonNullable<DrawingPacket['note']>;
type Stroke = { node: SVGGElement; paths: SVGPathElement[]; points: Point[]; sequence: number;
  ended: boolean; expiry: number; removal: number; expiresAt: number;
  note?: Note; bubble?: HTMLDivElement; input?: HTMLTextAreaElement; connector?: SVGLineElement; moved?: boolean };

const noteFont = '15px/20px Arial,"Microsoft YaHei","PingFang SC",sans-serif';
const notePadding = '2px 8px 7px';
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, value));

export function validDrawingPacket(value: any): value is DrawingPacket {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => ['strokeId', 'phase', 'sequence', 'points', 'note'].includes(key))
    && typeof value.strokeId === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(value.strokeId)
    && ['start', 'move', 'end', 'note', 'delete'].includes(value.phase)
    && Number.isSafeInteger(value.sequence) && value.sequence >= 0 && value.sequence <= 4096
    && (value.phase !== 'start' || value.sequence === 0)
    && Array.isArray(value.points) && value.points.length <= MAX_PACKET_POINTS
    && (['note', 'delete'].includes(value.phase) ? value.points.length === 0 : value.phase === 'end' || value.points.length > 0)
    && value.points.every((point: any) => Array.isArray(point) && point.length === 2
      && point.every((coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate)
        && coordinate >= 0 && coordinate <= 10000))
    && (value.phase === 'note' ? !!value.note && typeof value.note === 'object' && !Array.isArray(value.note)
      && Object.keys(value.note).length === 5 && Object.keys(value.note).every((key) => ['text', 'x', 'y', 'width', 'height'].includes(key))
      && typeof value.note.text === 'string' && value.note.text.length <= 1000
      && ['x', 'y', 'width', 'height'].every((key) => typeof value.note[key] === 'number' && Number.isFinite(value.note[key]))
      && value.note.x >= 0 && value.note.x <= 10000 && value.note.y >= 0 && value.note.y <= 10000
      && value.note.width >= 36 && value.note.width <= 960 && value.note.height >= 36 && value.note.height <= 800
      : !Object.prototype.hasOwnProperty.call(value, 'note'));
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
  const originalTabIndex = options.container.getAttribute('tabindex');
  if (options.teacher && originalTabIndex === null) options.container.tabIndex = -1;
  const layer = doc.createElementNS(namespace, 'svg');
  layer.dataset.liveShareUi = '';
  layer.dataset.liveSharePrivate = '';
  layer.dataset.shareDrawing = options.pageId;
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:2147482000';
  options.container.append(layer);
  const measure = doc.createElement('div');
  measure.dataset.liveShareUi = ''; measure.dataset.liveSharePrivate = '';
  measure.style.cssText = `all:initial;position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;min-width:0;max-width:none;padding:${notePadding};font:${noteFont};letter-spacing:normal;white-space:pre;overflow-wrap:anywhere;word-break:normal`;
  options.container.append(measure);
  const style = doc.createElement('style'); style.dataset.liveShareUi = ''; style.dataset.liveSharePrivate = '';
  style.textContent = '[data-share-drawing-note-input]::-webkit-scrollbar{display:none;width:0;height:0}';
  options.container.append(style);
  const strokes = new Map<string, Stroke>();
  const seen = new Set<string>();
  const bound = new Map<Window, { document: Document; root: Element | null; unbind: () => void }>();
  const watchedFrames = new Map<HTMLIFrameElement, () => void>();
  const localFrames = new Map<HTMLIFrameElement, { channel: string; href: string; lastSent: number; loaded: () => void }>();
  let connected = true;
  let disposed = false;
  let flushTimer = 0;
  let scanTimer = 0;
  let dragging: { id: string; pointer: number; start: Point; x: number; y: number; handle: HTMLElement } | null = null;
  let noteTimer = 0;
  const pendingNotes = new Set<string>();
  const composing = new Set<Window>();
  let active: { id: string; pointer: number; sequence: number; pending: Point[]; count: number; last: Point; started: number } | null = null;
  const now = () => win.performance.now();

  function remove(id: string) {
    const stroke = strokes.get(id);
    if (!stroke) return;
    win.clearTimeout(stroke.expiry); win.clearTimeout(stroke.removal);
    if (dragging?.id === id) endDrag();
    stroke.node.remove(); stroke.bubble?.remove(); stroke.connector?.remove(); strokes.delete(id); pendingNotes.delete(id);
  }
  function fade(id: string, delay: number) {
    const stroke = strokes.get(id);
    if (!stroke || stroke.note) return;
    win.clearTimeout(stroke.expiry);
    stroke.expiresAt = now() + delay + FADE_MS;
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
      if (strokes.size >= MAX_STROKES) {
        const temporary = [...strokes].find(([, value]) => !value.note);
        if (!temporary) return;
        remove(temporary[0]);
      }
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
      stroke = { node, paths, points: [], sequence: -1, ended: false, expiry: 0, removal: 0, expiresAt: Infinity };
      strokes.set(packet.strokeId, stroke);
    }
    if (!stroke || packet.sequence !== stroke.sequence + 1
      || stroke.points.length + packet.points.length > MAX_POINTS) return;
    if (packet.phase === 'note') {
      if (!stroke.ended) return;
      stroke.sequence = packet.sequence; stroke.note = { ...packet.note! };
      win.clearTimeout(stroke.expiry); win.clearTimeout(stroke.removal);
      stroke.expiry = 0; stroke.removal = 0; stroke.expiresAt = Infinity;
      stroke.node.style.transition = ''; stroke.node.style.opacity = '1';
      renderNote(packet.strokeId, stroke);
      return;
    }
    if (packet.phase === 'delete') { if (stroke.note) remove(packet.strokeId); return; }
    if (stroke.ended) return;
    stroke.sequence = packet.sequence;
    for (const point of packet.points) stroke.points.push([point[0], point[1]]);
    const path = pathFor(stroke.points);
    for (const shape of stroke.paths) shape.setAttribute('d', path);
    stroke.ended = packet.phase === 'end';
    fade(packet.strokeId, stroke.ended ? HOLD_MS : IDLE_MS);
  }
  function send(packet: DrawingPacket) { options.send?.(packet); }
  function noteDimensions(text: string) {
    measure.textContent = `${text || '字'}\u200b`;
    measure.style.width = 'max-content'; measure.style.whiteSpace = 'pre';
    const availableWidth = Math.max(36, Math.min(400, options.container.clientWidth - 24));
    const width = clamp(Math.ceil(parseFloat(win.getComputedStyle(measure).width)) + 4, 36, availableWidth);
    measure.style.width = `${width - 2}px`; measure.style.whiteSpace = 'pre-wrap';
    return { width, height: clamp(Math.ceil(measure.scrollHeight) + 14, 36, Math.min(800, options.container.clientHeight - 24)) };
  }
  function placeNote(stroke: Stroke, size: { width: number; height: number }) {
    const xs = stroke.points.map((point) => point[0]); const ys = stroke.points.map((point) => point[1]);
    const left = Math.min(...xs); const right = Math.max(...xs); const top = Math.min(...ys); const bottom = Math.max(...ys);
    let x = right + 16; let y = top;
    if (x + size.width > options.container.clientWidth - 10) {
      x = left; y = bottom + 16;
      if (y + size.height > options.container.clientHeight - 10) y = top - size.height - 16;
    }
    return { x: clamp(x, 8, options.container.clientWidth - size.width - 8),
      y: clamp(y, 8, options.container.clientHeight - size.height - 8) };
  }
  function publishNote(id: string) {
    pendingNotes.delete(id);
    const stroke = strokes.get(id);
    // Reserve the final allowed sequence for explicit deletion.
    if (!connected || !stroke?.note || stroke.sequence >= 4095) return;
    const packet: DrawingPacket = { strokeId: id, phase: 'note', sequence: stroke.sequence + 1, points: [], note: { ...stroke.note } };
    receive(packet); send(packet);
  }
  function flushNotes() {
    win.clearTimeout(noteTimer); noteTimer = 0;
    for (const id of [...pendingNotes]) publishNote(id);
  }
  function queueNote(id: string) {
    pendingNotes.add(id);
    if (!noteTimer) noteTimer = win.setTimeout(flushNotes, 32);
  }
  function endDrag() {
    if (!dragging) return;
    const { handle, pointer } = dragging;
    dragging = null;
    try { if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer); } catch { /* Already released. */ }
    handle.style.cursor = 'grab'; flushNotes();
  }
  function renderNote(id: string, stroke: Stroke) {
    const note = stroke.note;
    if (!note) return;
    if (!stroke.bubble) {
      const bubble = doc.createElement('div');
      bubble.dataset.shareDrawingNote = id; bubble.dataset.liveShareUi = ''; bubble.dataset.liveSharePrivate = '';
      bubble.style.cssText = `all:initial;display:block;position:absolute;box-sizing:border-box;min-width:0;min-height:0;max-width:none;max-height:none;padding:0;margin:0;border:1px solid #cbb9ef;border-radius:11px;background:#fffefd;color:#4a4263;box-shadow:0 4px 16px #66508a1a;z-index:2147482001;pointer-events:${options.teacher ? 'auto' : 'none'}`;
      const handle = doc.createElement('div'); handle.dataset.shareDrawingNoteDrag = '';
      handle.style.cssText = `all:initial;box-sizing:border-box;height:12px;border-radius:10px 10px 0 0;background:#f6f1fe;display:flex;justify-content:center;align-items:center;touch-action:none;cursor:${options.teacher ? 'grab' : 'default'};pointer-events:${options.teacher ? 'auto' : 'none'}`;
      const grip = doc.createElement('span');
      grip.style.cssText = 'all:initial;width:18px;height:3px;border-radius:4px;background:#d8c9ed;pointer-events:none'; handle.append(grip);
      const input = doc.createElement('textarea'); input.dataset.shareDrawingNoteInput = '';
      input.readOnly = !options.teacher; input.spellcheck = false; input.maxLength = 1000;
      input.tabIndex = options.teacher ? 0 : -1;
      input.setAttribute('aria-label', '笔迹标签'); input.setAttribute('wrap', 'soft');
      input.style.cssText = `all:initial;display:block;box-sizing:border-box;width:100%;height:calc(100% - 12px);min-width:0;max-width:none;min-height:0;max-height:none;margin:0;padding:${notePadding};border:0;border-radius:0 0 10px 10px;background:transparent;box-shadow:none;outline:none;color:#4a4263;font:${noteFont};letter-spacing:normal;text-align:left;text-indent:0;text-transform:none;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;resize:none;overflow-x:hidden;overflow-y:auto;scrollbar-width:none;pointer-events:${options.teacher ? 'auto' : 'none'}`;
      bubble.append(handle, input); options.container.append(bubble);
      const connector = doc.createElementNS(namespace, 'line');
      connector.setAttribute('stroke', '#ad99d9'); connector.setAttribute('stroke-width', '1.5');
      connector.setAttribute('stroke-linecap', 'round'); connector.setAttribute('opacity', '.8');
      layer.prepend(connector);
      stroke.bubble = bubble; stroke.input = input; stroke.connector = connector;
      input.addEventListener('keydown', (event) => event.stopPropagation());
      input.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
      if (options.teacher) {
        const close = doc.createElement('button'); close.type = 'button'; close.textContent = '×'; close.dataset.shareDrawingNoteDelete = '';
        close.setAttribute('aria-label', '删除笔迹标签'); close.title = '删除';
        close.style.cssText = 'all:initial;position:absolute;right:-7px;top:-7px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:17px;height:17px;min-width:0;min-height:0;margin:0;padding:0;border:1px solid #d9cdf1;border-radius:50%;background:#fff;color:#9a82c5;font:14px/1 Arial,sans-serif;cursor:pointer;box-shadow:0 1px 4px #66508a12';
        close.addEventListener('click', (event) => {
          cancelEvent(event);
          const current = strokes.get(id);
          if (!connected || !current?.note || current.sequence >= 4096) return;
          pendingNotes.delete(id);
          const packet: DrawingPacket = { strokeId: id, phase: 'delete', sequence: current.sequence + 1, points: [] };
          receive(packet); send(packet);
        });
        bubble.append(close);
        input.addEventListener('input', () => {
          const current = strokes.get(id);
          if (!connected || !current?.note || current.sequence >= 4095) return;
          const text = input.value.slice(0, 1000); const size = noteDimensions(text);
          const position = current.moved ? {
            x: clamp(current.note.x, 8, options.container.clientWidth - size.width - 8),
            y: clamp(current.note.y, 8, options.container.clientHeight - size.height - 8),
          } : placeNote(current, size);
          current.note = { text, ...size, ...position }; renderNote(id, current); queueNote(id);
        });
        input.addEventListener('blur', flushNotes);
        handle.addEventListener('pointerdown', (event) => {
          const current = strokes.get(id);
          if (event.button !== 0 || !connected || !current?.note || current.sequence >= 4095) return;
          const point = pointFrom(event, win); if (!point) return;
          cancelEvent(event); endDrag(); current.moved = true;
          dragging = { id, pointer: event.pointerId, start: point, x: current.note.x, y: current.note.y, handle };
          handle.style.cursor = 'grabbing';
          try { handle.setPointerCapture(event.pointerId); } catch { /* Synthetic tests do not own a pointer. */ }
        });
        handle.addEventListener('pointermove', (event) => {
          if (!dragging || dragging.id !== id || dragging.pointer !== event.pointerId) return;
          const current = strokes.get(id); const point = pointFrom(event, win);
          if (!current?.note || !point || current.sequence >= 4095) return;
          cancelEvent(event);
          current.note = { ...current.note,
            x: clamp(dragging.x + point[0] - dragging.start[0], 8, options.container.clientWidth - current.note.width - 8),
            y: clamp(dragging.y + point[1] - dragging.start[1], 8, options.container.clientHeight - current.note.height - 8) };
          renderNote(id, current); queueNote(id);
        });
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(name, endDrag);
      }
    }
    const { bubble, input, connector } = stroke;
    bubble!.style.left = `${note.x}px`; bubble!.style.top = `${note.y}px`;
    bubble!.style.width = `${note.width}px`; bubble!.style.height = `${note.height}px`;
    input!.readOnly = !options.teacher || stroke.sequence >= 4095;
    if (input!.value !== note.text) input!.value = note.text;
    if (input!.scrollHeight <= input!.clientHeight) input!.scrollTop = 0;
    const cx = note.x + note.width / 2; const cy = note.y + note.height / 2;
    let end = stroke.points[0];
    for (const point of stroke.points) if (Math.hypot(point[0] - cx, point[1] - cy) < Math.hypot(end[0] - cx, end[1] - cy)) end = point;
    const dx = end[0] - cx; const dy = end[1] - cy;
    const fraction = Math.min(1, note.width / 2 / Math.max(.001, Math.abs(dx)), note.height / 2 / Math.max(.001, Math.abs(dy)));
    connector!.setAttribute('x1', String(cx + dx * fraction)); connector!.setAttribute('y1', String(cy + dy * fraction));
    connector!.setAttribute('x2', String(end[0])); connector!.setAttribute('y2', String(end[1]));
  }
  function pinLatest() {
    if (active) finish();
    const entry = [...strokes].reverse().find(([, value]) => !value.note && value.ended && value.expiresAt > now()
      && value.node.isConnected && Number(win.getComputedStyle(value.node).opacity) > .01);
    if (!entry) return false;
    const [id, stroke] = entry; const size = noteDimensions('');
    const packet: DrawingPacket = { strokeId: id, phase: 'note', sequence: stroke.sequence + 1, points: [],
      note: { text: '', ...size, ...placeNote(stroke, size) } };
    receive(packet); send(packet); stroke.input?.focus({ preventScroll: true });
    return true;
  }
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
      if (strokes.size >= MAX_STROKES && [...strokes.values()].every((stroke) => stroke.note)) return;
      const id = Array.from(win.crypto.getRandomValues(new Uint8Array(12)), (value) => value.toString(16).padStart(2, '0')).join('');
      const packet: DrawingPacket = { strokeId: id, phase: 'start', sequence: 0, points: [point] };
      receive(packet);
      if (!strokes.has(id)) return;
      active = { id, pointer: event.pointerId, sequence: 0, pending: [], count: 1, last: point, started: now() };
      // Right drawing is an explicit new gesture, including when a previous
      // label still had focus. Keep its shortcut within this drawing surface.
      options.container.focus({ preventScroll: true });
      send(packet);
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
    const keydown = (event: KeyboardEvent) => {
      if (!connected || event.key !== 'Enter' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey
        || event.isComposing || event.keyCode === 229 || composing.has(eventWindow) || !within(event, eventWindow)) return;
      const target = event.target as Element | null;
      // Existing text/code note inputs own their line breaks. A previous
      // temporary pen stroke must never steal a shortcut while typing a note.
      if (typeof target?.closest === 'function' && target.closest('[data-share-drawing-note], [data-share-annotation-id]')) return;
      if (pinLatest()) cancelEvent(event);
    };
    const compositionStart = () => composing.add(eventWindow);
    const compositionEnd = () => composing.delete(eventWindow);
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
    eventWindow.addEventListener('keydown', keydown, true);
    eventWindow.addEventListener('compositionstart', compositionStart, true);
    eventWindow.addEventListener('compositionend', compositionEnd, true);
    // A replay can replace its HTML root before iframe load fires. Observing
    // the Document catches document.open() in the same microtask, so the first
    // right drag on a newly visible page cannot fall between polling ticks.
    const documentObserver = eventWindow === win ? null : new win.MutationObserver(() => scan());
    documentObserver?.observe(eventWindow.document, { childList: true });
    bound.set(eventWindow, { document: eventWindow.document, root: eventWindow.document.documentElement, unbind: () => {
      documentObserver?.disconnect();
      composing.delete(eventWindow);
      try {
      eventWindow.removeEventListener('pointerdown', down, true);
      eventWindow.removeEventListener('pointermove', move, true);
      eventWindow.removeEventListener('pointerup', up, true);
      eventWindow.removeEventListener('pointercancel', up, true);
      eventWindow.removeEventListener('contextmenu', suppressMenu, true);
      eventWindow.removeEventListener('mousedown', suppressMenu, true);
      eventWindow.removeEventListener('auxclick', suppressMenu, true);
      eventWindow.removeEventListener('blur', blur);
      eventWindow.removeEventListener('keydown', keydown, true);
      eventWindow.removeEventListener('compositionstart', compositionStart, true);
      eventWindow.removeEventListener('compositionend', compositionEnd, true);
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
    endDrag(); win.clearTimeout(noteTimer); noteTimer = 0; pendingNotes.clear(); composing.clear();
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
      for (const binding of bound.values()) binding.unbind(); bound.clear(); layer.remove(); measure.remove(); style.remove();
      if (options.teacher && originalTabIndex === null && options.container.getAttribute('tabindex') === '-1') options.container.removeAttribute('tabindex');
    },
  };
}
