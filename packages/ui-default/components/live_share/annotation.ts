export interface ShareAnnotation {
  startNodeId: number;
  endNodeId: number;
  startOffset: number;
  endOffset: number;
  quote: string;
  text: string;
  noteOpen: boolean;
  offsetX: number;
  offsetY: number;
  width?: number;
  height?: number;
}

interface Rect { x: number; y: number; width: number; height: number }
interface AnnotationRect extends Rect { rects?: Rect[] }
interface AnnotationPatch { text?: string; offsetX?: number; offsetY?: number; width?: number; height?: number }
let annotationLayer = 1003;
let annotationAsset = 0;

/** Follow visual rows, joining paragraph gaps with a broad, direct silhouette. */
function selectionOutline(lines: Rect[]) {
  const strips = lines.map((line) => ({ left: line.x - 4, top: line.y - 3, right: line.x + line.width + 4, bottom: line.y + line.height + 3 }));
  if (strips.every((strip, index) => !index || strip.top >= strips[index - 1].bottom)) {
    // Keep each row's actual width. Only the space between rows is bridged:
    // the two outer edges slope directly to the next row instead of doubling
    // back through a thin corridor (especially around inline formulas).
    const right = strips.flatMap((strip) => [[strip.right, strip.top], [strip.right, strip.bottom]]);
    const left = strips.slice().reverse().flatMap((strip) => [[strip.left, strip.bottom], [strip.left, strip.top]]);
    return strips.length ? `M ${[...right, ...left].map(([x, y]) => `${x} ${y}`).join(' L ')} Z` : '';
  }
  // Preserve separate horizontal runs in tables/columns and overlapping rows.
  // They cannot use a single left/right envelope without enclosing unrelated text.
  const regions = [...strips];
  for (let index = 1; index < strips.length; index++) {
    const a = strips[index - 1]; const b = strips[index];
    const left = Math.max(a.left, b.left); const right = Math.min(a.right, b.right);
    if (right > left) {
      // Fill only the shared horizontal span between rows, leaving short row ends outside.
      if (b.top > a.bottom) regions.push({ left, right, top: a.bottom, bottom: b.top });
    } else {
      // Disjoint text columns still form a single silhouette through a small elbow.
      const from = b.left >= a.right ? a.right - 3 : a.left + 3;
      const to = b.left >= a.right ? b.left + 3 : b.right - 3;
      const midY = (Math.min(a.bottom, b.top) + Math.max(a.bottom, b.top)) / 2;
      const ay = (a.top + a.bottom) / 2; const by = (b.top + b.bottom) / 2;
      regions.push({ left: from - 3, right: from + 3, top: Math.min(ay, midY), bottom: Math.max(ay, midY) },
        { left: Math.min(from, to), right: Math.max(from, to), top: midY - 3, bottom: midY + 3 },
        { left: to - 3, right: to + 3, top: Math.min(by, midY), bottom: Math.max(by, midY) });
    }
  }
  type Interval = [number, number];
  type Point = [number, number];
  const events = new Map<number, { add: number[]; remove: number[] }>();
  regions.forEach((region, index) => {
    for (const key of ['left', 'right', 'top', 'bottom']) region[key] = Math.round(region[key] * 1000) / 1000;
    if (region.right <= region.left || region.bottom <= region.top) return;
    for (const [y, kind] of [[region.top, 'add'], [region.bottom, 'remove']] as const) {
      if (!events.has(y)) events.set(y, { add: [], remove: [] });
      events.get(y)[kind].push(index);
    }
  });
  const merge = (intervals: Interval[]) => {
    const result: Interval[] = [];
    for (const [left, right] of intervals.sort((a, b) => a[0] - b[0])) {
      const last = result.at(-1);
      if (last && left <= last[1]) last[1] = Math.max(last[1], right);
      else result.push([left, right]);
    }
    return result;
  };
  const subtract = (source: Interval[], cover: Interval[]) => {
    const result: Interval[] = [];
    for (const [left, right] of source) {
      let start = left;
      for (const [a, b] of cover) {
        if (b <= start) continue;
        if (a >= right) break;
        if (a > start) result.push([start, a]);
        start = Math.max(start, b);
        if (start >= right) break;
      }
      if (start < right) result.push([start, right]);
    }
    return result;
  };
  const edges = new Map<string, Point[]>();
  const key = ([x, y]: Point) => `${x},${y}`;
  const edge = (from: Point, to: Point) => {
    const id = key(from);
    if (!edges.has(id)) edges.set(id, []);
    edges.get(id).push(to);
  };
  const active = new Set<number>();
  const rows = [...events.keys()].sort((a, b) => a - b);
  let previous: Interval[] = [];
  rows.forEach((y, index) => {
    const event = events.get(y);
    event.remove.forEach((id) => active.delete(id)); event.add.forEach((id) => active.add(id));
    const current = merge([...active].map((id) => [regions[id].left, regions[id].right]));
    subtract(current, previous).forEach(([left, right]) => edge([left, y], [right, y]));
    subtract(previous, current).forEach(([left, right]) => edge([right, y], [left, y]));
    const nextY = rows[index + 1];
    if (nextY !== undefined) current.forEach(([left, right]) => { edge([left, nextY], [left, y]); edge([right, y], [right, nextY]); });
    previous = current;
  });
  let outline: Point[] = []; let largestArea = 0;
  while (edges.size) {
    const first = edges.keys().next().value;
    const start = first.split(',').map(Number) as Point;
    const points: Point[] = [start]; let current = start;
    do {
      const options = edges.get(key(current));
      if (!options?.length) break;
      const next = options.pop();
      if (!options.length) edges.delete(key(current));
      current = next;
      if (key(current) !== first) points.push(current);
    } while (key(current) !== first);
    const area = Math.abs(points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0));
    if (area > largestArea) { largestArea = area; outline = points; }
  }
  const corners = outline.filter((point, index) => {
    const before = outline[(index + outline.length - 1) % outline.length]; const after = outline[(index + 1) % outline.length];
    return !((before[0] === point[0] && after[0] === point[0]) || (before[1] === point[1] && after[1] === point[1]));
  });
  return corners.length ? `M ${corners.map(([x, y]) => `${x} ${y}`).join(' L ')} Z` : '';
}

function roundedArrow(startX: number, startY: number, endX: number, endY: number) {
  const length = Math.hypot(endX - startX, endY - startY);
  if (length < 1) return '';
  const ux = (endX - startX) / length; const uy = (endY - startY) / length;
  const size = Math.min(1, length / 70);
  const points = [[0, -10 * size], [length - 30 * size, -10 * size], [length - 30 * size, -23 * size],
    [length, 0], [length - 30 * size, 23 * size], [length - 30 * size, 10 * size], [0, 10 * size]];
  const position = ([x, y]: number[]) => `${startX + x * ux - y * uy} ${startY + x * uy + y * ux}`;
  const corners = points.map((point, index) => {
    const before = points[(index + points.length - 1) % points.length]; const after = points[(index + 1) % points.length];
    const toward = (other: number[]) => {
      const distance = Math.hypot(other[0] - point[0], other[1] - point[1]);
      const ratio = Math.min((index === 0 || index === 6 ? 8 : 4) * size / distance, .45);
      return point.map((value, axis) => value + (other[axis] - value) * ratio);
    };
    return { before: toward(before), point, after: toward(after) };
  });
  return `M ${position(corners[0].before)} ${corners.map((corner) => `L ${position(corner.before)} Q ${position(corner.point)} ${position(corner.after)}`).join(' ')} Z`;
}

/** Both peers draw in the learner's CSS pixels, including when the teacher zooms the stage. */
export function attachAnnotationSurface(options: {
  container: HTMLElement;
  id?: string;
  teacher: boolean;
  onChange?: (patch: AnnotationPatch) => void;
  onClear?: () => void;
}) {
  const doc = options.container.ownerDocument;
  const win = doc.defaultView;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
    const element = doc.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  };
  const root = node('div', `live-share-annotation${options.teacher ? ' is-teacher' : ''}`);
  root.dataset.liveShareUi = '';
  root.dataset.liveSharePrivate = '';
  root.dataset.shareAnnotation = '';
  if (options.id) root.dataset.shareAnnotationId = options.id;
  root.hidden = true;
  const box = node('div', 'live-share-annotation__selection');
  box.dataset.shareAnnotationSelection = '';
  box.setAttribute('aria-hidden', 'true');
  const outlineSvg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  outlineSvg.classList.add('live-share-annotation__outline');
  outlineSvg.dataset.shareAnnotationOutline = '';
  const outline = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  outline.classList.add('live-share-annotation__box');
  outline.dataset.shareAnnotationBox = '';
  outlineSvg.append(outline); box.append(outlineSvg);
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('live-share-annotation__arrow');
  svg.dataset.shareAnnotationArrow = '';
  svg.setAttribute('aria-hidden', 'true');
  const arrowShape = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowShape.dataset.shareAnnotationArrowShape = '';
  const defs = doc.createElementNS(svg.namespaceURI, 'defs');
  const gradient = doc.createElementNS(svg.namespaceURI, 'linearGradient');
  gradient.id = `share-annotation-arrow-${++annotationAsset}`;
  gradient.setAttribute('x1', '0%'); gradient.setAttribute('y1', '0%'); gradient.setAttribute('x2', '100%'); gradient.setAttribute('y2', '100%');
  for (const [offset, color] of [['0%', '#c9a9ff'], ['55%', '#a58aef'], ['100%', '#8472dc']]) {
    const stop = doc.createElementNS(svg.namespaceURI, 'stop');
    stop.setAttribute('offset', offset); stop.setAttribute('stop-color', color); gradient.append(stop);
  }
  defs.append(gradient); arrowShape.setAttribute('fill', `url(#${gradient.id})`);
  svg.append(defs, arrowShape);
  const connector = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  connector.classList.add('live-share-annotation__connector');
  connector.dataset.shareAnnotationConnector = '';
  connector.setAttribute('aria-hidden', 'true');
  const connectorLine = doc.createElementNS(connector.namespaceURI, 'path');
  connectorLine.setAttribute('fill', 'none');
  connector.append(connectorLine);
  const bubble = node('aside', 'live-share-annotation__bubble');
  bubble.dataset.shareAnnotationNote = '';
  bubble.setAttribute('aria-label', '老师批注');
  const header = node('div', 'live-share-annotation__header');
  header.dataset.shareAnnotationDrag = '';
  const mark = node('span', 'live-share-annotation__mark', '✦');
  mark.setAttribute('aria-hidden', 'true');
  header.append(mark, node('span', 'live-share-annotation__title', '老师批注'));
  const textarea = options.teacher ? node('textarea', 'live-share-annotation__input') : null;
  const copy = options.teacher ? null : node('div', 'live-share-annotation__text');
  let close: HTMLButtonElement | null = null;
  let resizeHandle: HTMLButtonElement | null = null;
  if (textarea) {
    const grip = node('span', 'live-share-annotation__grip', '⠿');
    grip.setAttribute('aria-hidden', 'true');
    header.append(grip);
    header.title = '拖动批注';
    close = node('button', 'live-share-annotation__close', '删除批注');
    close.type = 'button';
    close.dataset.shareAnnotationClear = '';
    close.setAttribute('aria-label', '删除批注');
    close.title = '删除这条批注';
    header.append(close);
    textarea.setAttribute('aria-label', '批注内容');
    textarea.dataset.shareAnnotationInput = '';
    textarea.placeholder = '输入提示，回车换行…';
    textarea.maxLength = 1000;
    textarea.rows = 2;
    textarea.spellcheck = false;
    resizeHandle = node('button', 'live-share-annotation__resize');
    resizeHandle.type = 'button';
    resizeHandle.dataset.shareAnnotationResize = '';
    resizeHandle.setAttribute('aria-label', '调整批注大小');
    resizeHandle.title = '拖动调整大小，也可使用方向键';
    bubble.append(header, textarea, node('div', 'live-share-annotation__hint', '实时同步 · 右下角可调整大小'), resizeHandle);
  } else {
    copy.dataset.shareAnnotationText = '';
    copy.tabIndex = 0;
    copy.setAttribute('aria-label', '老师批注内容，可滚动查看');
    bubble.append(header, copy);
  }
  root.append(box, svg, connector, bubble);
  options.container.append(root);
  let annotation: ShareAnnotation | null = null;
  let selectionRect: AnnotationRect | null = null;
  let disposed = false;
  let drag: { id: number; x: number; y: number; offsetX: number; offsetY: number } | null = null;
  let resizing: { id: number; x: number; y: number; width: number; height: number; left: number; top: number } | null = null;
  let dragFrame = 0;
  let pendingDrag: AnnotationPatch | null = null;
  let inputMeasure: { text: string; width: number; maxHeight: number; fixed: boolean } | null = null;
  let bodyMaxHeight = 0;
  let outlineGeometry = '';
  const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(Math.max(lower, upper), value));
  const bringToFront = () => { root.style.zIndex = String(++annotationLayer); };

  function selectionLines(rect: AnnotationRect, width: number, height: number) {
    const source = rect.rects?.length ? rect.rects : [rect];
    const visible = source.filter((line) => ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(line[key]))
      && line.width > 0 && line.height > 0 && line.x < width && line.y < height && line.x + line.width > 0 && line.y + line.height > 0)
      .map(({ x, y, width: w, height: h }) => ({ x, y, width: w, height: h })).sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: { anchor: Rect; pieces: Rect[] }[] = [];
    // Start with the largest glyphs so a superscript or a differently sized
    // formula cannot split a sentence into several rows. Compare to a fixed
    // anchor, rather than an expanding union that could absorb the next line.
    for (const piece of visible.sort((a, b) => b.height - a.height || a.y - b.y || a.x - b.x)) {
      let closest: typeof rows[number] | undefined; let distance = Infinity;
      for (const row of rows) {
        const a = row.anchor;
        const overlap = Math.min(a.y + a.height, piece.y + piece.height) - Math.max(a.y, piece.y);
        const centerDistance = Math.abs(a.y + a.height / 2 - piece.y - piece.height / 2);
        if (overlap >= Math.min(a.height, piece.height) * .5
          && centerDistance <= Math.max(a.height, piece.height) * .5 && centerDistance < distance) {
          closest = row; distance = centerDistance;
        }
      }
      if (closest) closest.pieces.push(piece);
      else rows.push({ anchor: piece, pieces: [piece] });
    }
    const lines: Rect[] = [];
    for (const { pieces } of rows) {
      const top = Math.min(...pieces.map((piece) => piece.y));
      const bottom = Math.max(...pieces.map((piece) => piece.y + piece.height));
      let run: Rect | undefined;
      for (const piece of pieces.sort((a, b) => a.x - b.x)) {
        // Small inline gaps belong to the selected sentence; distant columns
        // remain separate. Overflow-clipped text is never remeasured here.
        if (run && piece.x <= run.x + run.width + Math.max(1, piece.height * .25)) {
          run.width = Math.max(run.width, piece.x + piece.width - run.x);
        } else {
          run = { x: piece.x, y: top, width: piece.width, height: bottom - top };
          lines.push(run);
        }
      }
    }
    return lines.sort((a, b) => a.y - b.y || a.x - b.x);
  }

  function draw() {
    if (disposed) return;
    const rect = selectionRect;
    const width = options.container.clientWidth;
    const height = options.container.clientHeight;
    const lines = rect ? selectionLines(rect, width, height) : [];
    root.hidden = !annotation || !rect || !width || !height || rect.width <= 0 || rect.height <= 0
      || !lines.length;
    if (root.hidden || !rect || !annotation) return;
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    outlineSvg.style.width = `${rect.width}px`; outlineSvg.style.height = `${rect.height}px`;
    const relativeLines = lines.map((line) => ({ ...line, x: line.x - rect.x, y: line.y - rect.y }));
    const geometry = JSON.stringify(relativeLines);
    if (geometry !== outlineGeometry) { outlineGeometry = geometry; outline.setAttribute('d', selectionOutline(relativeLines)); }
    bubble.hidden = !annotation.noteOpen;
    svg.toggleAttribute('hidden', annotation.noteOpen);
    connector.toggleAttribute('hidden', !annotation.noteOpen);
    if (textarea && textarea.value !== annotation.text) textarea.value = annotation.text;
    const displayText = annotation.text.trim() ? annotation.text : '老师正在输入…';
    const copyChanged = copy && copy.textContent !== displayText;
    const copyScrollTop = copy?.scrollTop || 0;
    const followingText = copyChanged && !copy.classList.contains('is-placeholder') && copy.textContent
      && copy.scrollHeight - copy.clientHeight - copy.scrollTop < 8;
    if (copyChanged) copy.textContent = displayText;
    copy?.classList.toggle('is-placeholder', !annotation.text.trim());
    const availableWidth = Math.max(1, Math.min(960, width - 24));
    const availableHeight = Math.max(1, Math.min(800, height - 24));
    const noteWidth = clamp(Number.isFinite(annotation.width) ? annotation.width : 300, Math.min(220, availableWidth), availableWidth);
    const fixedHeight = Number.isFinite(annotation.height) && annotation.height > 0;
    bubble.style.width = `${noteWidth}px`;
    bubble.style.height = fixedHeight ? `${clamp(annotation.height, Math.min(136, availableHeight), availableHeight)}px` : '';
    bubble.classList.toggle('is-sized', fixedHeight);
    const maxBodyHeight = Math.max(24, Math.min(options.teacher ? 190 : 220, height - (options.teacher ? 100 : 90)));
    if (textarea && fixedHeight) {
      textarea.style.flex = '1 1 0px';
      textarea.style.minHeight = '0px'; textarea.style.maxHeight = 'none'; textarea.style.height = '0px';
      inputMeasure = { text: annotation.text, width: noteWidth, maxHeight: maxBodyHeight, fixed: true };
    } else if (bodyMaxHeight !== maxBodyHeight || inputMeasure?.fixed) {
      bodyMaxHeight = maxBodyHeight;
      if (textarea) {
        textarea.style.flex = '0 0 auto';
        textarea.style.minHeight = `${Math.min(52, maxBodyHeight)}px`;
        textarea.style.maxHeight = `${maxBodyHeight}px`;
      }
    }
    if (copy) {
      copy.style.flex = fixedHeight ? '1 1 0px' : '0 0 auto';
      copy.style.minHeight = '0px';
      copy.style.maxHeight = fixedHeight ? 'none' : `${maxBodyHeight}px`;
    }
    if (textarea && !fixedHeight && !bubble.hidden && (!inputMeasure || inputMeasure.text !== annotation.text
      || inputMeasure.width !== noteWidth || inputMeasure.maxHeight !== maxBodyHeight || inputMeasure.fixed)) {
      const scrollTop = textarea.scrollTop;
      textarea.style.height = '0px';
      textarea.style.height = `${Math.min(maxBodyHeight, Math.max(52, textarea.scrollHeight))}px`;
      textarea.scrollTop = scrollTop;
      inputMeasure = { text: annotation.text, width: noteWidth, maxHeight: maxBodyHeight, fixed: false };
    }
    if (copyChanged) copy.scrollTop = followingText ? copy.scrollHeight : copyScrollTop;
    const margin = 12;
    const bubbleWidth = bubble.offsetWidth;
    const bubbleHeight = bubble.offsetHeight;
    const x = clamp(rect.x + annotation.offsetX, margin, width - bubbleWidth - margin);
    const y = clamp(rect.y + annotation.offsetY, margin, height - bubbleHeight - margin);
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    let focusLine = lines[0];
    if (!bubble.hidden) {
      const cx = x + bubbleWidth / 2; const cy = y + bubbleHeight / 2;
      const distance = (line: Rect) => Math.hypot(cx - clamp(cx, line.x, line.x + line.width), cy - clamp(cy, line.y, line.y + line.height));
      for (const line of lines) if (distance(line) < distance(focusLine)) focusLine = line;
    }
    const visible = { left: clamp(focusLine.x - 2, 3, width - 3), top: clamp(focusLine.y - 1, 3, height - 3),
      right: clamp(focusLine.x + focusLine.width + 2, 3, width - 3), bottom: clamp(focusLine.y + focusLine.height + 1, 3, height - 3) };
    let endX: number; let endY: number; let startX: number; let startY: number;
    if (bubble.hidden) {
      // A selection starts with an arrow; opening its note replaces it with a plain connector.
      const above = visible.top > 64;
      endX = clamp(visible.left + Math.min(22, focusLine.width / 3), 8, width - 8);
      endY = above ? visible.top - 2 : visible.bottom + 2;
      startX = clamp(endX - 62, 18, width - 18);
      startY = clamp(endY + (above ? -58 : 58), 18, height - 18);
    } else {
      const centerX = x + bubbleWidth / 2;
      const centerY = y + bubbleHeight / 2;
      const horizontalDistance = Math.abs(centerX - (visible.left + visible.right) / 2) / Math.max(1, visible.right - visible.left);
      const verticalDistance = Math.abs(centerY - (visible.top + visible.bottom) / 2) / Math.max(1, visible.bottom - visible.top);
      if (horizontalDistance > verticalDistance) {
        endX = centerX < visible.left ? visible.left - 2 : visible.right + 2;
        endY = clamp(centerY, visible.top + 3, visible.bottom - 3);
      } else {
        endX = clamp(centerX, visible.left + 3, visible.right - 3);
        endY = centerY < visible.top ? visible.top - 2 : visible.bottom + 2;
      }
      const dx = endX - centerX;
      const dy = endY - centerY;
      const fraction = Math.min(bubbleWidth / 2 / Math.max(.001, Math.abs(dx)), bubbleHeight / 2 / Math.max(.001, Math.abs(dy)));
      startX = centerX + dx * Math.min(1, fraction);
      startY = centerY + dy * Math.min(1, fraction);
    }
    svg.style.width = `${width}px`; svg.style.height = `${height}px`;
    connector.style.width = `${width}px`; connector.style.height = `${height}px`;
    arrowShape.setAttribute('d', roundedArrow(startX, startY, endX, endY));
    connectorLine.setAttribute('d', `M ${startX} ${startY} L ${endX} ${endY}`);
  }

  function update(patch: AnnotationPatch) {
    if (!annotation || disposed) return;
    annotation = { ...annotation, ...patch };
    draw();
    options.onChange?.(patch);
  }
  function input() { if (textarea) update({ text: textarea.value.slice(0, 1000) }); }
  function clear() { options.onClear?.(); }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); textarea?.blur(); }
    event.stopPropagation();
  }
  // Scrolling a long note stays local to the note; it never becomes a command
  // to scroll the learner's page. The read-only copy can also be selected.
  function wheel(event: WheelEvent) { event.stopPropagation(); }
  function flushDrag() {
    dragFrame = 0;
    if (!pendingDrag) return;
    const patch = pendingDrag; pendingDrag = null;
    options.onChange?.(patch);
  }
  function pointerdown(event: PointerEvent) {
    if (!options.teacher || !annotation || !selectionRect || resizing || drag || event.button !== 0 || (event.target as Element)?.closest('button')) return;
    event.preventDefault(); event.stopPropagation();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
      offsetX: Number.parseFloat(bubble.style.left) - selectionRect.x, offsetY: Number.parseFloat(bubble.style.top) - selectionRect.y };
    try { header.setPointerCapture(event.pointerId); } catch { /* Pointer may already be released. */ }
    root.classList.add('is-dragging');
  }
  function pointermove(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId || !selectionRect || !annotation) return;
    event.preventDefault(); event.stopPropagation();
    const bounds = root.getBoundingClientRect();
    const scaleX = bounds.width / (root.clientWidth || 1);
    const scaleY = bounds.height / (root.clientHeight || 1);
    if (!(scaleX > 0 && scaleY > 0)) return;
    const offsetX = clamp(selectionRect.x + drag.offsetX + (event.clientX - drag.x) / scaleX,
      12, root.clientWidth - bubble.offsetWidth - 12) - selectionRect.x;
    const offsetY = clamp(selectionRect.y + drag.offsetY + (event.clientY - drag.y) / scaleY,
      12, root.clientHeight - bubble.offsetHeight - 12) - selectionRect.y;
    annotation = { ...annotation, offsetX, offsetY };
    pendingDrag = { offsetX, offsetY };
    draw();
    if (!dragFrame) dragFrame = win.requestAnimationFrame(flushDrag);
  }
  function pointerup(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    finishDrag();
  }
  function finishDrag() {
    if (!drag) return;
    const id = drag.id;
    drag = null; root.classList.remove('is-dragging');
    try { header.releasePointerCapture(id); } catch { /* Capture may already be lost. */ }
    win.cancelAnimationFrame(dragFrame); flushDrag();
  }
  function resizeSize(width: number, height: number, left: number, top: number) {
    // Keep synchronized sizes within the protocol limits even in a tiny pane.
    // draw() independently clips the visible bubble to the available viewport.
    const maxWidth = Math.max(160, Math.min(960, root.clientWidth - left - 12));
    const maxHeight = Math.max(100, Math.min(800, root.clientHeight - top - 12));
    return { width: clamp(width, Math.min(220, maxWidth), maxWidth), height: clamp(height, Math.min(136, maxHeight), maxHeight) };
  }
  function resizeDown(event: PointerEvent) {
    if (!annotation || !selectionRect || drag || resizing || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    resizing = { id: event.pointerId, x: event.clientX, y: event.clientY, width: bubble.offsetWidth, height: bubble.offsetHeight,
      left: Number.parseFloat(bubble.style.left), top: Number.parseFloat(bubble.style.top) };
    try { resizeHandle.setPointerCapture(event.pointerId); } catch { /* Pointer may already be released. */ }
    root.classList.add('is-resizing');
  }
  function resizeMove(event: PointerEvent) {
    if (!resizing || resizing.id !== event.pointerId || !annotation) return;
    event.preventDefault(); event.stopPropagation();
    const bounds = root.getBoundingClientRect();
    const scaleX = bounds.width / (root.clientWidth || 1); const scaleY = bounds.height / (root.clientHeight || 1);
    if (!(scaleX > 0 && scaleY > 0)) return;
    const patch = resizeSize(resizing.width + (event.clientX - resizing.x) / scaleX,
      resizing.height + (event.clientY - resizing.y) / scaleY, resizing.left, resizing.top);
    annotation = { ...annotation, ...patch }; pendingDrag = patch;
    draw();
    if (!dragFrame) dragFrame = win.requestAnimationFrame(flushDrag);
  }
  function resizeUp(event: PointerEvent) {
    if (!resizing || resizing.id !== event.pointerId) return;
    finishResize();
  }
  function finishResize() {
    if (!resizing) return;
    const id = resizing.id;
    resizing = null; root.classList.remove('is-resizing');
    try { resizeHandle.releasePointerCapture(id); } catch { /* Capture may already be lost. */ }
    win.cancelAnimationFrame(dragFrame); flushDrag();
  }
  function finishGestures() { finishDrag(); finishResize(); }
  function resizeKey(event: KeyboardEvent) {
    if (!annotation || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 40 : 16;
    update(resizeSize(bubble.offsetWidth + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      bubble.offsetHeight + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
      Number.parseFloat(bubble.style.left), Number.parseFloat(bubble.style.top)));
  }
  textarea?.addEventListener('input', input);
  textarea?.addEventListener('keydown', keydown);
  close?.addEventListener('click', clear);
  bubble.addEventListener('pointerdown', bringToFront, true);
  bubble.addEventListener('focusin', bringToFront);
  bubble.addEventListener('wheel', wheel, { passive: true });
  header.addEventListener('pointerdown', pointerdown);
  header.addEventListener('pointermove', pointermove);
  header.addEventListener('pointerup', pointerup);
  header.addEventListener('pointercancel', pointerup);
  header.addEventListener('lostpointercapture', pointerup);
  resizeHandle?.addEventListener('pointerdown', resizeDown);
  resizeHandle?.addEventListener('pointermove', resizeMove);
  resizeHandle?.addEventListener('pointerup', resizeUp);
  resizeHandle?.addEventListener('pointercancel', resizeUp);
  resizeHandle?.addEventListener('lostpointercapture', resizeUp);
  resizeHandle?.addEventListener('keydown', resizeKey);
  win.addEventListener('blur', finishGestures);
  const resize = new ResizeObserver(draw);
  resize.observe(options.container);
  return {
    render(next: ShareAnnotation | null, rect: AnnotationRect | null, _showEditor = false) {
      if (next && (!annotation || next.text !== annotation.text || next.noteOpen !== annotation.noteOpen
        || next.offsetX !== annotation.offsetX || next.offsetY !== annotation.offsetY
        || next.width !== annotation.width || next.height !== annotation.height)) bringToFront();
      annotation = next ? { ...next, ...((drag || resizing) && pendingDrag ? pendingDrag : {}) } : null;
      selectionRect = rect;
      draw();
    },
    focus() { if (!disposed && !root.hidden && !bubble.hidden) textarea?.focus({ preventScroll: true }); },
    dispose() {
      disposed = true; pendingDrag = null; win.cancelAnimationFrame(dragFrame); resize.disconnect();
      textarea?.removeEventListener('input', input);
      textarea?.removeEventListener('keydown', keydown);
      close?.removeEventListener('click', clear);
      bubble.removeEventListener('pointerdown', bringToFront, true);
      bubble.removeEventListener('focusin', bringToFront);
      bubble.removeEventListener('wheel', wheel);
      header.removeEventListener('pointerdown', pointerdown);
      header.removeEventListener('pointermove', pointermove);
      header.removeEventListener('pointerup', pointerup);
      header.removeEventListener('pointercancel', pointerup);
      header.removeEventListener('lostpointercapture', pointerup);
      resizeHandle?.removeEventListener('pointerdown', resizeDown);
      resizeHandle?.removeEventListener('pointermove', resizeMove);
      resizeHandle?.removeEventListener('pointerup', resizeUp);
      resizeHandle?.removeEventListener('pointercancel', resizeUp);
      resizeHandle?.removeEventListener('lostpointercapture', resizeUp);
      resizeHandle?.removeEventListener('keydown', resizeKey);
      win.removeEventListener('blur', finishGestures);
      root.remove();
    },
  };
}
