import { placeAnnotationArrow } from './annotation_arrow';

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

/** Trace only the outside of the selected visual rows, never their shared edges. */
function selectionOutline(lines: Rect[]) {
  const strips = lines.map((line) => ({ left: line.x - 4, top: line.y - 3,
    right: line.x + line.width + 4, bottom: line.y + line.height + 3 }));
  if (!strips.length) return '';
  type Point = [number, number];
  const left: Point[] = []; const right: Point[] = [];
  const levels = [...new Set(strips.flatMap((strip) => [strip.top, strip.bottom]))].sort((a, b) => a - b);
  for (let index = 1; index < levels.length; index++) {
    const top = levels[index - 1]; const bottom = levels[index];
    const active = strips.filter((strip) => strip.top < bottom && strip.bottom > top);
    if (!active.length) continue;
    // A horizontal band has exactly two outside edges. Padding around inline
    // code, overlapping line boxes and selected spaces are inside the same
    // block; drawing their individual rectangle edges would leave seam lines.
    const start = Math.min(...active.map((strip) => strip.left));
    const end = Math.max(...active.map((strip) => strip.right));
    left.push([start, top], [start, bottom]);
    right.push([end, top], [end, bottom]);
  }
  // Empty bands between paragraphs connect directly to the next outside edge.
  // Each text row retains its own ends, rather than becoming a bounding box.
  const points = [...right, ...left.reverse()].filter((point, index, all) => !index
    || point[0] !== all[index - 1][0] || point[1] !== all[index - 1][1]);
  const corners = points.filter((point, index) => {
    const before = points[(index + points.length - 1) % points.length];
    const after = points[(index + 1) % points.length];
    return (point[0] - before[0]) * (after[1] - point[1])
      !== (point[1] - before[1]) * (after[0] - point[0]);
  });
  return corners.length ? `M ${corners.map(([x, y]) => `${x} ${y}`).join(' L ')} Z` : '';
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
  header.setAttribute('aria-label', '拖动批注');
  const textarea = options.teacher ? node('textarea', 'live-share-annotation__input') : null;
  const copy = options.teacher ? null : node('div', 'live-share-annotation__text');
  let close: HTMLButtonElement | null = null;
  let resizeHandle: HTMLButtonElement | null = null;
  if (textarea) {
    header.setAttribute('role', 'button');
    header.tabIndex = 0;
    header.title = '拖动批注';
    close = node('button', 'live-share-annotation__close', '×');
    close.type = 'button';
    close.dataset.shareAnnotationClear = '';
    close.setAttribute('aria-label', '删除批注');
    close.title = '删除这条批注';
    textarea.setAttribute('aria-label', '批注内容');
    textarea.dataset.shareAnnotationInput = '';
    textarea.placeholder = '…';
    textarea.maxLength = 1000;
    textarea.rows = 1;
    textarea.spellcheck = false;
    resizeHandle = node('button', 'live-share-annotation__resize');
    resizeHandle.type = 'button';
    resizeHandle.dataset.shareAnnotationResize = '';
    resizeHandle.setAttribute('aria-label', '调整批注大小');
    resizeHandle.title = '拖动调整大小，也可使用方向键';
    bubble.append(textarea, header, close, resizeHandle);
  } else {
    copy.dataset.shareAnnotationText = '';
    copy.tabIndex = 0;
    copy.setAttribute('aria-label', '老师批注内容，可滚动查看');
    bubble.append(copy);
  }
  const measure = node('div', 'live-share-annotation__measure');
  measure.setAttribute('aria-hidden', 'true');
  root.append(box, svg, connector, bubble, measure);
  options.container.append(root);
  let annotation: ShareAnnotation | null = null;
  let selectionRect: AnnotationRect | null = null;
  let disposed = false;
  let drag: { id: number; x: number; y: number; offsetX: number; offsetY: number } | null = null;
  let resizing: { id: number; x: number; y: number; width: number; height: number; left: number; top: number } | null = null;
  let dragFrame = 0;
  let pendingDrag: AnnotationPatch | null = null;
  let measured: { text: string; width: number; height: number; availableWidth: number; availableHeight: number; fixedWidth?: number; fixedHeight?: number } | null = null;
  let outlineGeometry = '';
  let arrowGeometry = '';
  let arrowPath = '';
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
      const left = Math.min(...pieces.map((piece) => piece.x));
      const right = Math.max(...pieces.map((piece) => piece.x + piece.width));
      // A selected visual row is one strip, including the spacing around inline
      // code. Keeping those pieces separate introduces false internal borders.
      // These are already clipped text rectangles; never remeasure the Range.
      lines.push({ x: left, y: top, width: right - left, height: bottom - top });
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
    const displayText = annotation.text || '…';
    const copyChanged = copy && copy.textContent !== displayText;
    const copyScrollTop = copy?.scrollTop || 0;
    const inputScrollTop = textarea?.scrollTop || 0;
    const followingText = copyChanged && !copy.classList.contains('is-placeholder') && copy.textContent
      && copy.scrollHeight - copy.clientHeight - copy.scrollTop < 8;
    if (copyChanged) copy.textContent = displayText;
    copy?.classList.toggle('is-placeholder', !annotation.text);
    const availableWidth = Math.max(1, Math.min(960, width - 24));
    const availableHeight = Math.max(1, Math.min(800, height - 24));
    const fixedWidth = Number.isFinite(annotation.width) && annotation.width > 0 ? annotation.width : undefined;
    const fixedHeight = Number.isFinite(annotation.height) && annotation.height > 0 ? annotation.height : undefined;
    if (!measured || measured.text !== annotation.text || measured.availableWidth !== availableWidth
      || measured.availableHeight !== availableHeight || measured.fixedWidth !== fixedWidth || measured.fixedHeight !== fixedHeight) {
      // Both peers use the same styled text measurement. No heading/footer is
      // reserved; an empty note or a single character is just a small bubble.
      // A trailing zero-width character keeps the final newline measurable.
      measure.textContent = `${displayText}\u200b`;
      measure.style.width = 'max-content';
      measure.style.whiteSpace = 'pre';
      const naturalWidth = Math.ceil(measure.scrollWidth) + 2;
      const noteWidth = clamp(fixedWidth ?? Math.min(360, naturalWidth), Math.min(36, availableWidth), availableWidth);
      measure.style.width = `${Math.max(1, noteWidth - 2)}px`;
      measure.style.whiteSpace = 'pre-wrap';
      const noteHeight = clamp(fixedHeight ?? Math.min(260, Math.ceil(measure.scrollHeight) + 2),
        Math.min(36, availableHeight), availableHeight);
      measured = { text: annotation.text, width: noteWidth, height: noteHeight, availableWidth, availableHeight, fixedWidth, fixedHeight };
    }
    bubble.style.width = `${measured.width}px`;
    bubble.style.height = `${measured.height}px`;
    bubble.classList.toggle('is-sized', !!fixedWidth || !!fixedHeight);
    if (textarea) textarea.scrollTop = inputScrollTop;
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
      const key = `${width}|${height}|${rect.x}|${rect.y}|${geometry}`;
      if (key !== arrowGeometry) {
        arrowGeometry = key; arrowPath = placeAnnotationArrow(lines, width, height)?.d || '';
        arrowShape.setAttribute('d', arrowPath);
      }
      svg.toggleAttribute('hidden', !arrowPath);
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
      connectorLine.setAttribute('d', `M ${startX} ${startY} L ${endX} ${endY}`);
    }
    svg.style.width = `${width}px`; svg.style.height = `${height}px`;
    connector.style.width = `${width}px`; connector.style.height = `${height}px`;
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
    const maxWidth = Math.max(36, Math.min(960, root.clientWidth - left - 12));
    const maxHeight = Math.max(36, Math.min(800, root.clientHeight - top - 12));
    return { width: clamp(width, 36, maxWidth), height: clamp(height, 36, maxHeight) };
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
  function dragKey(event: KeyboardEvent) {
    if (!annotation || !selectionRect || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 24 : 8;
    update({
      offsetX: clamp(selectionRect.x + annotation.offsetX + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
        12, root.clientWidth - bubble.offsetWidth - 12) - selectionRect.x,
      offsetY: clamp(selectionRect.y + annotation.offsetY + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
        12, root.clientHeight - bubble.offsetHeight - 12) - selectionRect.y,
    });
  }
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
  header.addEventListener('keydown', dragKey);
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
      header.removeEventListener('keydown', dragKey);
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
