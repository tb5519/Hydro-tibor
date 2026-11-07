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
}

interface AnnotationRect { x: number; y: number; width: number; height: number }
interface AnnotationPatch { text?: string; offsetX?: number; offsetY?: number }
let annotationLayer = 1003;

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
  const box = node('div', 'live-share-annotation__box');
  box.dataset.shareAnnotationBox = '';
  box.setAttribute('aria-hidden', 'true');
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('live-share-annotation__arrow');
  svg.dataset.shareAnnotationArrow = '';
  svg.setAttribute('aria-hidden', 'true');
  const arrowLine = doc.createElementNS(svg.namespaceURI, 'path');
  const arrowHead = doc.createElementNS(svg.namespaceURI, 'path');
  arrowLine.setAttribute('fill', 'none');
  arrowHead.setAttribute('fill', 'none');
  svg.append(arrowLine, arrowHead);
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
  if (textarea) {
    const grip = node('span', 'live-share-annotation__grip', '⠿');
    grip.setAttribute('aria-hidden', 'true');
    header.append(grip);
    header.title = '拖动批注';
    close = node('button', 'live-share-annotation__close', '×');
    close.type = 'button';
    close.dataset.shareAnnotationClear = '';
    close.setAttribute('aria-label', '清除标注');
    close.title = '清除标注';
    header.append(close);
    textarea.setAttribute('aria-label', '批注内容');
    textarea.dataset.shareAnnotationInput = '';
    textarea.placeholder = '输入提示，回车换行…';
    textarea.maxLength = 1000;
    textarea.rows = 2;
    textarea.spellcheck = false;
    bubble.append(header, textarea, node('div', 'live-share-annotation__hint', '实时同步 · 回车换行 · 拖动顶部可移动'));
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
  let dragFrame = 0;
  let pendingDrag: AnnotationPatch | null = null;
  let inputMeasure: { text: string; width: number; maxHeight: number } | null = null;
  let bodyMaxHeight = 0;
  const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(Math.max(lower, upper), value));
  const bringToFront = () => { root.style.zIndex = String(++annotationLayer); };

  function draw() {
    if (disposed) return;
    const rect = selectionRect;
    const width = options.container.clientWidth;
    const height = options.container.clientHeight;
    root.hidden = !annotation || !rect || !width || !height || rect.width <= 0 || rect.height <= 0
      || rect.x >= width || rect.y >= height || rect.x + rect.width <= 0 || rect.y + rect.height <= 0;
    if (root.hidden || !rect || !annotation) return;
    box.style.left = `${rect.x - 5}px`;
    box.style.top = `${rect.y - 4}px`;
    box.style.width = `${rect.width + 10}px`;
    box.style.height = `${rect.height + 8}px`;
    bubble.hidden = !annotation.noteOpen;
    svg.toggleAttribute('hidden', annotation.noteOpen);
    connector.toggleAttribute('hidden', !annotation.noteOpen);
    if (close) {
      // Keep one clear button per mark. Before its note opens it sits outside
      // the selection; afterwards the same button belongs to the note header.
      const floating = !annotation.noteOpen;
      const parent = floating ? root : header;
      if (close.parentElement !== parent) parent.append(close);
      close.classList.toggle('is-on-box', floating);
      if (floating) {
        close.style.left = `${clamp(rect.x + rect.width + 7, 6, width - 30)}px`;
        close.style.top = `${clamp(rect.y >= 30 ? rect.y - 28 : rect.y + rect.height + 8, 6, height - 30)}px`;
      } else {
        close.style.removeProperty('left'); close.style.removeProperty('top');
      }
    }
    if (textarea && textarea.value !== annotation.text) textarea.value = annotation.text;
    const displayText = annotation.text.trim() ? annotation.text : '老师正在输入…';
    const copyChanged = copy && copy.textContent !== displayText;
    const copyScrollTop = copy?.scrollTop || 0;
    const followingText = copyChanged && !copy.classList.contains('is-placeholder') && copy.textContent
      && copy.scrollHeight - copy.clientHeight - copy.scrollTop < 8;
    if (copyChanged) copy.textContent = displayText;
    copy?.classList.toggle('is-placeholder', !annotation.text.trim());
    const noteWidth = Math.min(300, Math.max(0, width - 24));
    bubble.style.width = `${noteWidth}px`;
    const maxBodyHeight = Math.max(24, Math.min(options.teacher ? 190 : 220, height - (options.teacher ? 100 : 90)));
    if (bodyMaxHeight !== maxBodyHeight) {
      bodyMaxHeight = maxBodyHeight;
      if (textarea) {
        textarea.style.minHeight = `${Math.min(52, maxBodyHeight)}px`;
        textarea.style.maxHeight = `${maxBodyHeight}px`;
      } else copy.style.maxHeight = `${maxBodyHeight}px`;
    }
    if (textarea && !bubble.hidden && (!inputMeasure || inputMeasure.text !== annotation.text
      || inputMeasure.width !== noteWidth || inputMeasure.maxHeight !== maxBodyHeight)) {
      const scrollTop = textarea.scrollTop;
      textarea.style.height = '0px';
      textarea.style.height = `${Math.min(maxBodyHeight, Math.max(52, textarea.scrollHeight))}px`;
      textarea.scrollTop = scrollTop;
      inputMeasure = { text: annotation.text, width: noteWidth, maxHeight: maxBodyHeight };
    }
    if (copyChanged) copy.scrollTop = followingText ? copy.scrollHeight : copyScrollTop;
    const margin = 12;
    const bubbleWidth = bubble.offsetWidth;
    const bubbleHeight = bubble.offsetHeight;
    const x = clamp(rect.x + annotation.offsetX, margin, width - bubbleWidth - margin);
    const y = clamp(rect.y + annotation.offsetY, margin, height - bubbleHeight - margin);
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    const visible = { left: clamp(rect.x - 5, 3, width - 3), top: clamp(rect.y - 4, 3, height - 3),
      right: clamp(rect.x + rect.width + 5, 3, width - 3), bottom: clamp(rect.y + rect.height + 4, 3, height - 3) };
    let endX: number; let endY: number; let startX: number; let startY: number;
    if (bubble.hidden) {
      // A selection starts with an arrow; opening its note replaces it with a plain connector.
      const above = visible.top > 48;
      endX = clamp(visible.left + Math.min(18, rect.width / 3), 8, width - 8);
      endY = above ? visible.top - 2 : visible.bottom + 2;
      startX = clamp(endX - 34, 10, width - 10);
      startY = clamp(endY + (above ? -32 : 32), 10, height - 10);
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
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy);
    const ux = dx / Math.max(1, length);
    const uy = dy / Math.max(1, length);
    const arrowSize = Math.min(8, length / 3);
    svg.style.width = `${width}px`; svg.style.height = `${height}px`;
    connector.style.width = `${width}px`; connector.style.height = `${height}px`;
    arrowLine.setAttribute('d', `M ${startX} ${startY} L ${endX} ${endY}`);
    connectorLine.setAttribute('d', `M ${startX} ${startY} L ${endX} ${endY}`);
    arrowHead.setAttribute('d', `M ${endX - ux * arrowSize - uy * arrowSize * .65} ${endY - uy * arrowSize + ux * arrowSize * .65} L ${endX} ${endY} L ${endX - ux * arrowSize + uy * arrowSize * .65} ${endY - uy * arrowSize - ux * arrowSize * .65}`);
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
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); clear(); }
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
    if (!options.teacher || !annotation || !selectionRect || event.button !== 0 || (event.target as Element)?.closest('button')) return;
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
    try { header.releasePointerCapture(event.pointerId); } catch { /* Capture may already be lost. */ }
    drag = null; root.classList.remove('is-dragging');
    win.cancelAnimationFrame(dragFrame); flushDrag();
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
  const resize = new ResizeObserver(draw);
  resize.observe(options.container);
  return {
    render(next: ShareAnnotation | null, rect: AnnotationRect | null, _showEditor = false) {
      if (next && (!annotation || next.text !== annotation.text || next.noteOpen !== annotation.noteOpen
        || next.offsetX !== annotation.offsetX || next.offsetY !== annotation.offsetY)) bringToFront();
      annotation = next ? { ...next } : null;
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
      root.remove();
    },
  };
}
