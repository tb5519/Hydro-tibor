import { attachAnnotationSurface, ShareAnnotation } from './live_share/annotation';
import { attachStandaloneCodeFocus } from './live_share/editor';
import { attachTemporaryDrawing, DrawingPacket, validDrawingPacket } from './live_share/drawing';
import {
  captureDrawingAnchor, registerDrawingEditor, drawingEditorGeometry, drawingNodeGeometry, resolveDrawingAnchor,
  DrawingMatrix, DrawingAnchorBinding, DrawingAnchorMode, DrawingGeometry,
} from './live_share/drawing_anchor';

export interface SolutionMark {
  id: string; start: number; end: number; quote: string; text: string; noteOpen: boolean;
  offsetX: number; offsetY: number; width?: number; height?: number;
}
export interface SolutionTextMark extends SolutionMark { key: string }
export interface SolutionCodeMark extends SolutionMark { editorId: string }
export interface SolutionInkMark {
  id: string;
  anchor: { kind: 'element'; key: string; path: number[]; mode?: DrawingAnchorMode; textOffset?: number }
    | { kind: 'editor'; editorId: string; offset?: number };
  reference: DrawingMatrix; points: [number, number][];
  note?: NonNullable<DrawingPacket['note']>;
}
export interface SolutionAnnotationDocument {
  version: 1; text: SolutionTextMark[]; code: SolutionCodeMark[]; ink: SolutionInkMark[];
}

const privateSelector = '[data-live-share-ui],[data-live-share-private],[data-solution-annotation-exclude],script,style,textarea,input';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const bounded = (value: unknown, max = 10000): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(value);
function validMark(value: SolutionMark) {
  return value && validId(value.id) && Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end)
    && value.start >= 0 && value.end > value.start && value.end <= 1000000
    && typeof value.quote === 'string' && value.quote.length <= 10000
    && typeof value.text === 'string' && value.text.length <= 1000 && typeof value.noteOpen === 'boolean'
    && bounded(value.offsetX) && bounded(value.offsetY)
    && (value.width === undefined || bounded(value.width, 960) && value.width >= 36)
    && (value.height === undefined || bounded(value.height, 800) && value.height >= 36);
}

/** Independent saved annotations. No shared session, transport, cache or editor binding is created. */
export function attachSolutionAnnotations(options: {
  root: HTMLElement; editable: boolean; initial?: SolutionAnnotationDocument;
  onChange?: (value: SolutionAnnotationDocument) => void;
  editors?: Array<{ id: string; editor: any }>;
}) {
  const { root, editable } = options;
  const doc = root.ownerDocument; const win = doc.defaultView!;
  const position = root.style.position;
  if (win.getComputedStyle(root).position === 'static') root.style.position = 'relative';
  const initial = options.initial?.version === 1 ? options.initial : undefined;
  const text = new Map<string, SolutionTextMark>((Array.isArray(initial?.text) ? initial.text : []).slice(0, 40)
    .filter((item) => validMark(item) && validId(item.key)).map((item) => [item.id, clone(item)]));
  const code = new Map<string, SolutionCodeMark>((Array.isArray(initial?.code) ? initial.code : []).slice(0, 40)
    .filter((item) => validMark(item) && validId(item.editorId)).map((item) => [item.id, clone(item)]));
  const ink = new Map<string, SolutionInkMark>();
  const textSurfaces = new Map<string, ReturnType<typeof attachAnnotationSurface>>();
  const codeSurfaces = new Map<string, ReturnType<typeof attachStandaloneCodeFocus>>();
  const editors = new Map((options.editors || []).filter((item) => validId(item.id) && root.contains(item.editor?.getDomNode?.()))
    .map((item) => [item.id, item.editor]));
  const cleanups: Array<() => void> = [];
  let disposed = false; let restoring = true; let renderFrame = 0; let emitFrame = 0;
  let transient: { kind: 'text' | 'code'; id: string } | null = null;
  let lastGesture: 'selection' | 'ink' = 'selection';
  let nextNodeId = 0;
  const ids = new WeakMap<Element, number>(); const nodes = new Map<number, Element>();
  const anchors = {
    identify(node: Element) {
      if (!root.contains(node)) return null;
      if (!ids.has(node)) { ids.set(node, ++nextNodeId); nodes.set(nextNodeId, node); }
      return { nodeId: ids.get(node)! };
    },
    resolve(identity: { nodeId: number }) { return nodes.get(identity.nodeId) || null; },
  };
  const raw = (): SolutionAnnotationDocument => ({ version: 1, text: [...text.values()], code: [...code.values()], ink: [...ink.values()] });
  const emit = () => {
    if (!editable || disposed || restoring || emitFrame) return;
    emitFrame = win.requestAnimationFrame(() => { emitFrame = 0; if (!disposed) options.onChange?.(clone(raw())); });
  };
  const keyRoot = (key: string): HTMLElement | null => key === '$root' ? root
    : [...root.querySelectorAll<HTMLElement>('[data-solution-annotation-text]')].find((node) => node.dataset.solutionAnnotationText === key) || null;
  // The workspace itself is intentionally private to unrelated screen sharing;
  // its own annotation tool may read it, while nested private controls stay out.
  const excluded = (element: Element | null, selector = privateSelector) => {
    const match = element?.closest(selector);
    return !!match && match !== root && root.contains(match);
  };
  const textNodes = (element: HTMLElement): Text[] => {
    const walker = doc.createTreeWalker(element, win.NodeFilter.SHOW_TEXT, { acceptNode(node) {
      return excluded(node.parentElement, `${privateSelector},[data-live-share-editor],.monaco-editor`)
        ? win.NodeFilter.FILTER_REJECT : win.NodeFilter.FILTER_ACCEPT;
    } });
    const values: Text[] = []; let node: Node | null;
    while ((node = walker.nextNode())) values.push(node as Text);
    return values;
  };
  function rangeFor(mark: SolutionTextMark) {
    const element = keyRoot(mark.key); if (!element) return null;
    const values = textNodes(element); const full = values.map((node) => node.data).join('');
    if (mark.end > full.length || full.slice(mark.start, mark.end) !== mark.quote) return null;
    const range = doc.createRange(); let offset = 0; let started = false;
    for (const node of values) {
      const end = offset + node.length;
      if (!started && mark.start < end) { range.setStart(node, mark.start - offset); started = true; }
      if (started && mark.end <= end) { range.setEnd(node, mark.end - offset); return range; }
      offset = end;
    }
    return null;
  }
  function rectFor(mark: SolutionTextMark) {
    const range = rangeFor(mark); if (!range) return null;
    const bounds = root.getBoundingClientRect();
    const sx = bounds.width / (root.offsetWidth || 1); const sy = bounds.height / (root.offsetHeight || 1);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => ({
      x: (rect.left - bounds.left) / sx + root.scrollLeft,
      y: (rect.top - bounds.top) / sy + root.scrollTop, width: rect.width / sx, height: rect.height / sy,
    }));
    if (!rects.length) return null;
    const x = Math.min(...rects.map((rect) => rect.x)); const y = Math.min(...rects.map((rect) => rect.y));
    return { x, y, width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
      height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y, rects };
  }
  function erase(kind: 'text' | 'code', id: string) {
    (kind === 'text' ? text : code).delete(id);
    if (transient?.id === id) transient = null;
    refresh(); emit();
  }
  function refresh() {
    if (disposed) return;
    for (const [id, mark] of text) {
      let surface = textSurfaces.get(id);
      if (!surface) {
        surface = attachAnnotationSurface({ container: root, id, teacher: editable,
          onChange: (patch) => { if (!editable) return; Object.assign(mark, patch); refresh(); emit(); },
          onClear: () => { if (editable) erase('text', id); } });
        textSurfaces.set(id, surface);
      }
      surface.render({ ...mark, startNodeId: 1, endNodeId: 1, startOffset: mark.start, endOffset: mark.end }, rectFor(mark));
    }
    for (const [id, surface] of textSurfaces) if (!text.has(id)) { surface.dispose(); textSurfaces.delete(id); }
    for (const [id, mark] of code) {
      const editor = editors.get(mark.editorId); if (!editor) continue;
      let surface = codeSurfaces.get(id);
      if (!surface) {
        surface = attachStandaloneCodeFocus({ editor, container: root, id, teacher: editable,
          onChange: (patch) => { if (!editable) return; Object.assign(mark, patch); refresh(); emit(); },
          onClear: () => { if (editable) erase('code', id); } });
        codeSurfaces.set(id, surface);
      }
      const value = editor.getModel()?.getValue();
      surface.render(typeof value === 'string' && value.slice(mark.start, mark.end) === mark.quote ? mark : null);
    }
    for (const [id, surface] of codeSurfaces) if (!code.has(id)) { surface.dispose(); codeSurfaces.delete(id); }
  }
  const schedule = () => { if (!disposed && !renderFrame) renderFrame = win.requestAnimationFrame(() => { renderFrame = 0; refresh(); }); };
  function clearTransient() {
    if (transient) erase(transient.kind, transient.id);
  }
  const newId = () => Array.from(win.crypto.getRandomValues(new Uint8Array(12)), (value) => value.toString(16).padStart(2, '0')).join('');
  function selected(kind: 'text' | 'code', value: Omit<SolutionTextMark, keyof SolutionMark> | Omit<SolutionCodeMark, keyof SolutionMark>, start: number, end: number, quote: string) {
    if (!editable || disposed || !quote.trim() || quote.length > 10000 || start === end) return;
    const entries = kind === 'text' ? text : code;
    if (entries.size >= 40 && !transient) return;
    clearTransient();
    const mark = { id: newId(), start, end, quote, text: '', noteOpen: false, offsetX: 0, offsetY: 32, ...value };
    if (kind === 'text') text.set(mark.id, mark as SolutionTextMark); else code.set(mark.id, mark as SolutionCodeMark);
    transient = { kind, id: mark.id }; lastGesture = 'selection'; refresh(); emit();
  }
  function selectedText() {
    if (!editable || disposed) return;
    const selection = doc.getSelection(); if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0); const common = range.commonAncestorContainer;
    const element = common.nodeType === 1 ? common as Element : common.parentElement;
    if (!element || !root.contains(element) || excluded(element, `${privateSelector},[data-live-share-editor],.monaco-editor`)) return;
    const section = element.closest<HTMLElement>('[data-solution-annotation-text]');
    if (!section || !root.contains(section) || !validId(section.dataset.solutionAnnotationText)) return;
    const values = textNodes(section);
    const offsetAt = (node: Node, offset: number) => {
      let total = 0; const point = doc.createRange(); point.setStart(node, offset); point.collapse(true);
      for (const current of values) {
        if (current === node) return total + offset;
        if (point.comparePoint(current, 0) >= 0) return total;
        total += current.length;
      }
      return total;
    };
    const start = offsetAt(range.startContainer, range.startOffset); const end = offsetAt(range.endContainer, range.endOffset);
    selected('text', { key: section.dataset.solutionAnnotationText! }, start, end, values.map((node) => node.data).join('').slice(start, end));
    if (transient?.kind === 'text') root.focus({ preventScroll: true });
  }
  function elementAnchor(node: Element): SolutionInkMark['anchor'] | null {
    if (!root.contains(node) || excluded(node)) return null;
    for (const [editorId, editor] of editors) if (editor.getDomNode() === node) return { kind: 'editor', editorId };
    const section = node.closest<HTMLElement>('[data-solution-annotation-text]');
    const base = section && root.contains(section) ? section : root;
    const key = base === root ? '$root' : base.dataset.solutionAnnotationText!;
    const path: number[] = []; let current: Element | null = node;
    while (current && current !== base && path.length < 24) {
      const parent: Element | null = current.parentElement; if (!parent) return null;
      path.unshift([...parent.children].filter((child) => !child.matches('[data-live-share-ui]')).indexOf(current)); current = parent;
    }
    return current === base ? { kind: 'element', key, path } : null;
  }
  function resolveInk(anchor: SolutionInkMark['anchor']): HTMLElement | null {
    if (anchor?.kind === 'editor') return editors.get(anchor.editorId)?.getDomNode() || null;
    if (anchor?.kind !== 'element' || typeof anchor.key !== 'string' || !Array.isArray(anchor.path) || anchor.path.length > 24) return null;
    let node: Element | null = keyRoot(anchor.key);
    for (const index of anchor.path) {
      if (!Number.isInteger(index) || index < 0 || index > 20000 || !node) return null;
      node = [...node.children].filter((child) => !child.matches('[data-live-share-ui]'))[index] || null;
    }
    return node && root.contains(node) && !excluded(node) ? node as HTMLElement : null;
  }
  function textPoint(node: HTMLElement, offset: number) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return null;
    let remaining = offset;
    const values = textNodes(node);
    for (let index = 0; index < values.length; index++) {
      const child = values[index];
      if (remaining < child.length || index === values.length - 1 && remaining === child.length) {
        const range = doc.createRange(); range.setStart(child, remaining); range.collapse(true);
        const rect = range.getBoundingClientRect();
        return rect.height > 0 ? rect : null;
      }
      remaining -= child.length;
    }
    return null;
  }
  function inkGeometry(mark: SolutionInkMark, binding?: DrawingAnchorBinding): DrawingGeometry | null {
    const node = resolveInk(mark.anchor); if (!node) return null;
    if (mark.anchor.kind === 'editor') return drawingEditorGeometry(node, root, mark.anchor.offset);
    if (!mark.anchor.mode && binding) return resolveDrawingAnchor(binding, root, anchors);
    const geometry = drawingNodeGeometry(node, mark.anchor.mode || 'element', root);
    if (!geometry || mark.anchor.textOffset === undefined) return geometry;
    const point = textPoint(node, mark.anchor.textOffset); if (!point) return null;
    const rect = node.getBoundingClientRect();
    const scaleX = geometry.matrix[0] / (rect.width / (node.offsetWidth || rect.width || 1));
    const scaleY = geometry.matrix[3] / (rect.height / (node.offsetHeight || rect.height || 1));
    // Text-local origin survives a narrower learner layout wrapping the same
    // words onto a different line. Ink keeps its freehand shape around it.
    const matrix = [...geometry.matrix] as DrawingMatrix;
    matrix[4] += (point.left - rect.left) * scaleX; matrix[5] += (point.top - rect.top) * scaleY;
    return { ...geometry, matrix };
  }
  function pointerPosition(point: [number, number]) {
    const rect = root.getBoundingClientRect();
    return { x: rect.left + point[0] * rect.width / root.clientWidth,
      y: rect.top + point[1] * rect.height / root.clientHeight };
  }
  function capturedTextOffset(node: HTMLElement, point: [number, number]) {
    const position = pointerPosition(point);
    const caret = (doc as any).caretPositionFromPoint?.(position.x, position.y);
    const range = !caret && (doc as any).caretRangeFromPoint?.(position.x, position.y);
    const target = caret?.offsetNode || range?.startContainer; const index = caret?.offset ?? range?.startOffset;
    if (!target || target.nodeType !== 3 || !node.contains(target) || !Number.isSafeInteger(index)) return undefined;
    let offset = 0;
    for (const child of textNodes(node)) {
      if (child === target) {
        const value = offset + index; const rect = textPoint(node, value);
        // Blank padding/space below a paragraph must remain element-local.
        return rect && position.y >= rect.top - 4 && position.y <= rect.bottom + 4 ? value : undefined;
      }
      offset += child.length;
    }
    return undefined;
  }
  function captureInk(target: EventTarget | null, point: [number, number], id: string): DrawingAnchorBinding | null {
    const targetNode = target as HTMLElement | null;
    if (!targetNode || targetNode.nodeType !== 1 || !root.contains(targetNode) || excluded(targetNode)) return null;
    const editorEntry = [...editors].find(([, editor]) => editor.getDomNode()?.contains(targetNode));
    let anchor: SolutionInkMark['anchor']; let binding: DrawingAnchorBinding;
    if (editorEntry) {
      const [editorId, editor] = editorEntry; const node = editor.getDomNode();
      const captured = captureDrawingAnchor(node, root, anchors); if (!captured?.anchor) return null;
      const position = pointerPosition(point); const model = editor.getModel(); if (!model) return null;
      let line = editor.getTargetAtClientPoint(position.x, position.y)?.position?.lineNumber;
      if (!line) {
        const rect = node.getBoundingClientRect();
        const y = (position.y - rect.top) * node.offsetHeight / rect.height + editor.getScrollTop();
        let low = 1; let high = model.getLineCount();
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (editor.getTopForLineNumber(middle) <= y) low = middle; else high = middle - 1;
        }
        line = low;
      }
      const offset = model.getOffsetAt({ lineNumber: line, column: 1 });
      anchor = { kind: 'editor', editorId, offset }; binding = captured;
    } else {
      // Never climb into the platform's outer scrolling viewport. Such a node
      // is outside this artifact, cannot be saved, and moves independently of
      // the statement. Bind to the actual content node inside the workspace.
      const captured = elementAnchor(targetNode); if (!captured || captured.kind !== 'element') return null;
      const style = win.getComputedStyle(targetNode);
      const scrolls = targetNode.scrollHeight > targetNode.clientHeight + 1 && /(auto|scroll|overlay)/.test(style.overflowY)
        || targetNode.scrollWidth > targetNode.clientWidth + 1 && /(auto|scroll|overlay)/.test(style.overflowX);
      const mode: DrawingAnchorMode = targetNode.namespaceURI === 'http://www.w3.org/2000/svg' ? 'svg' : scrolls ? 'scroll' : 'element';
      const offset = mode === 'element' ? capturedTextOffset(targetNode, point) : undefined;
      anchor = { ...captured, mode, ...(offset !== undefined ? { textOffset: offset } : {}) };
      const identity = anchors.identify(targetNode)!;
      binding = { node: targetNode, mode, reference: [1, 0, 0, 1, 0, 0],
        anchor: { kind: 'dom', mode, ...identity, matrix: [1, 0, 0, 1, 0, 0] } };
    }
    const mark: SolutionInkMark = { id, anchor, reference: binding.reference, points: [point] };
    const geometry = inkGeometry(mark, binding); if (!geometry || !binding.anchor) return null;
    binding = { ...binding, reference: geometry.matrix, anchor: { ...binding.anchor, matrix: geometry.matrix } };
    mark.reference = [...geometry.matrix]; ink.set(id, mark);
    return binding;
  }
  for (const [id, editor] of editors) {
    const node = editor.getDomNode() as HTMLElement; const previous = node.getAttribute('data-live-share-editor');
    // This is only the renderer's local anchor registry. It never registers a
    // source editor or changes its read-only/model/undo state.
    node.setAttribute('data-live-share-editor', `solution-${id}`);
    const unregister = registerDrawingEditor(node, editor);
    cleanups.push(() => { unregister(); if (previous === null) node.removeAttribute('data-live-share-editor'); else node.setAttribute('data-live-share-editor', previous); });
    if (editable) {
      const selection = editor.onDidChangeCursorSelection((event: any) => {
        if (!editor.hasTextFocus?.()) return;
        const model = editor.getModel(); const range = event.selection;
        if (!model || !range) return;
        const start = model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn });
        const end = model.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn });
        if (start === end) { if (transient?.kind === 'code') clearTransient(); return; }
        selected('code', { editorId: id }, start, end, model.getValue().slice(start, end));
      });
      const content = editor.onDidChangeModelContent((event: any) => {
        const changes = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
        const shift = (position: number, end: boolean) => {
          for (const change of changes) {
            const right = change.rangeOffset + change.rangeLength;
            if (position >= right) position += change.text.length - change.rangeLength;
            else if (position > change.rangeOffset) position = change.rangeOffset + (end ? change.text.length : 0);
          }
          return position;
        };
        for (const [key, mark] of code) if (mark.editorId === id) {
          mark.start = shift(mark.start, false); mark.end = shift(mark.end, true);
          mark.quote = editor.getModel().getValue().slice(mark.start, mark.end);
          if (!mark.quote) code.delete(key);
        }
        for (const mark of ink.values()) if (mark.anchor.kind === 'editor' && mark.anchor.editorId === id && mark.anchor.offset !== undefined) {
          mark.anchor.offset = Math.max(0, Math.min(editor.getModel().getValueLength(), shift(mark.anchor.offset, false)));
        }
        schedule(); emit();
      });
      cleanups.push(() => { selection.dispose(); content.dispose(); });
    }
  }
  const drawing = attachTemporaryDrawing({ container: root, teacher: editable, pageId: 'solution-annotations',
    persistent: true, handleNoteShortcut: false, anchors,
    captureAnchor: captureInk,
    resolveAnchor: (binding, id) => {
      const mark = ink.get(id); return mark ? inkGeometry(mark, binding) : resolveDrawingAnchor(binding, root, anchors);
    },
    onStart: () => { clearTransient(); lastGesture = 'ink'; },
    onRemove: (id) => { if (!disposed && ink.delete(id)) emit(); },
    send: (packet) => {
      if (restoring || disposed) return;
      if (packet.phase === 'start') {
        const mark = ink.get(packet.strokeId); if (mark) mark.points = clone(packet.points);
      } else if (packet.phase === 'delete') ink.delete(packet.strokeId);
      else {
        const mark = ink.get(packet.strokeId); if (!mark) return;
        if (packet.points.length) mark.points.push(...clone(packet.points));
        if (packet.note) mark.note = clone(packet.note);
      }
      emit();
    },
  });
  for (const item of (Array.isArray(initial?.ink) ? initial.ink : []).slice(0, 32)) {
    if (!item || !/^[a-zA-Z0-9_-]{8,96}$/.test(item.id) || !Array.isArray(item.points) || !item.points.length || item.points.length > 2048
      || !Array.isArray(item.reference) || item.reference.length !== 6 || !item.reference.every((part, index) => bounded(part, index < 4 ? 100 : 1e7))) continue;
    const node = resolveInk(item.anchor); if (!node) continue;
    if (item.anchor.kind === 'element' && (item.anchor.mode !== undefined && !['element', 'scroll', 'svg'].includes(item.anchor.mode)
      || item.anchor.textOffset !== undefined && (!Number.isSafeInteger(item.anchor.textOffset) || item.anchor.textOffset < 0 || item.anchor.textOffset > 1000000))) continue;
    if (item.anchor.kind === 'editor' && item.anchor.offset !== undefined
      && (!Number.isSafeInteger(item.anchor.offset) || item.anchor.offset < 0 || item.anchor.offset > Math.min(1000000, editors.get(item.anchor.editorId)?.getModel()?.getValueLength() ?? -1))) continue;
    let binding = captureDrawingAnchor(node, root, anchors);
    // Old element records do not carry a mode. Preserve their saved target if
    // the new page's outer scroll wrapper would otherwise capture it instead.
    if (item.anchor.kind === 'element' && (item.anchor.mode || !binding?.anchor || !binding.node || !root.contains(binding.node))) {
      const mode = item.anchor.mode || 'element'; const geometry = drawingNodeGeometry(node, mode, root);
      if (!geometry) continue;
      binding = { node, mode, reference: geometry.matrix,
        anchor: { kind: 'dom', mode, ...anchors.identify(node)!, matrix: geometry.matrix } };
    }
    if (!binding?.anchor) continue;
    const packets: DrawingPacket[] = [{ strokeId: item.id, phase: 'start', sequence: 0, points: item.points.slice(0, 32),
      anchor: { ...binding.anchor, matrix: item.reference } }];
    for (let index = 32; index < item.points.length; index += 32) packets.push({ strokeId: item.id, phase: 'move', sequence: packets.length, points: item.points.slice(index, index + 32) });
    packets.push({ strokeId: item.id, phase: 'end', sequence: packets.length, points: [] });
    if (item.note) packets.push({ strokeId: item.id, phase: 'note', sequence: packets.length, points: [], note: item.note });
    if (!packets.every(validDrawingPacket)) continue;
    ink.set(item.id, clone(item)); packets.forEach((packet) => drawing.receive(packet));
  }
  function keydown(event: KeyboardEvent) {
    if (!editable || disposed || event.isComposing || event.keyCode === 229 || event.key !== 'Enter' || !event.shiftKey
      || event.altKey || event.ctrlKey || event.metaKey
      || !root.contains(event.target as Node) && !root.contains(doc.getSelection()?.anchorNode || null)
      || (event.target as Element)?.closest?.('[data-share-annotation-id],[data-share-drawing-note]')) return;
    if (lastGesture === 'ink' && drawing.pinLatest()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (!transient) return;
    const { kind, id } = transient; const mark = (kind === 'text' ? text : code).get(id); if (!mark) return;
    const rect = kind === 'text' ? rectFor(mark as SolutionTextMark) : null;
    mark.noteOpen = true; mark.offsetX = 0; mark.offsetY = (rect?.height || 24) + 20;
    transient = null; refresh();
    if (kind === 'text') textSurfaces.get(id)?.focus(); else codeSurfaces.get(id)?.render(mark, true);
    event.preventDefault(); event.stopImmediatePropagation(); emit();
  }
  const pointerdown = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as Element)?.closest?.('[data-share-annotation-id],[data-share-drawing-note]')) return;
    clearTransient(); lastGesture = 'selection';
  };
  const pointerup = (event: PointerEvent) => { if (event.button === 0) selectedText(); };
  const keyup = (event: KeyboardEvent) => { if (event.shiftKey && event.key !== 'Enter') selectedText(); };
  if (editable) {
    root.addEventListener('pointerdown', pointerdown, true); root.addEventListener('pointerup', pointerup);
    root.addEventListener('keyup', keyup); win.addEventListener('keydown', keydown, true);
  }
  const observer = new win.ResizeObserver(schedule); observer.observe(root);
  doc.addEventListener('scroll', schedule, true); win.addEventListener('resize', schedule);
  restoring = false; refresh();
  return {
    serialize(): SolutionAnnotationDocument { drawing.flushPending(); return clone(raw()); },
    refresh,
    dispose() {
      if (disposed) return;
      drawing.flush(); disposed = true;
      win.cancelAnimationFrame(renderFrame); win.cancelAnimationFrame(emitFrame);
      root.removeEventListener('pointerdown', pointerdown, true); root.removeEventListener('pointerup', pointerup);
      root.removeEventListener('keyup', keyup); win.removeEventListener('keydown', keydown, true);
      doc.removeEventListener('scroll', schedule, true); win.removeEventListener('resize', schedule); observer.disconnect();
      drawing.dispose(); textSurfaces.forEach((surface) => surface.dispose()); codeSurfaces.forEach((surface) => surface.dispose());
      cleanups.forEach((cleanup) => cleanup()); root.style.position = position;
    },
  };
}
