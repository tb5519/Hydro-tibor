export type DrawingMatrix = [number, number, number, number, number, number];
export type DrawingAnchorMode = 'element' | 'scroll' | 'svg';
export interface DrawingClip { x: number; y: number; width: number; height: number }
export interface DrawingGeometry { matrix: DrawingMatrix; clip: DrawingClip }
export type DrawingAnchor = {
  kind: 'dom'; mode: DrawingAnchorMode; nodeId: number; frameId?: string; matrix: DrawingMatrix;
} | {
  kind: 'editor'; mode: 'scroll'; editorId: string; matrix: DrawingMatrix;
};
export interface DrawingNodeIdentity { nodeId: number; frameId?: string }
export interface DrawingAnchorResolvers {
  identify: (node: Element) => DrawingNodeIdentity | null;
  resolve: (identity: DrawingNodeIdentity) => Element | null;
  /** Controlled opaque Scratch frames return geometry in the parent viewport. */
  frameGeometry?: (anchor: DrawingAnchor) => DrawingGeometry | null;
}

const editors = new Map<HTMLElement, any>();
/** Register the stable editor root, never Monaco's recycled visual line nodes. */
export function registerDrawingEditor(node: HTMLElement, editor?: any): () => void {
  editors.set(node, editor || null);
  return () => { if (editors.get(node) === (editor || null)) editors.delete(node); };
}
/** Only used to fingerprint a pinned annotation's source; the text is never persisted. */
export function drawingEditorContent(node: HTMLElement): string | null {
  if (!editors.has(node)) return null;
  const editor = editors.get(node);
  return editor ? editor.getModel?.()?.getValue?.() ?? null : (node as HTMLTextAreaElement).value ?? null;
}

const identity: DrawingMatrix = [1, 0, 0, 1, 0, 0];
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{8,96}$/.test(value);
const privateSelector = '[data-live-share-ui],[data-live-share-private],[data-teacher-assistant],[data-private],[data-sensitive],[inert],input[type="password"],input[type="hidden"],input[type="file"]';
export function validDrawingAnchor(value: any): value is DrawingAnchor {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !['dom', 'editor'].includes(value.kind) || !['element', 'scroll', 'svg'].includes(value.mode)
    || !Array.isArray(value.matrix) || value.matrix.length !== 6
    || !value.matrix.every((part: unknown, index: number) => typeof part === 'number' && Number.isFinite(part) && Math.abs(part) <= (index < 4 ? 100 : 1e7))
    || Math.abs(value.matrix[0] * value.matrix[3] - value.matrix[1] * value.matrix[2]) < 1e-6) return false;
  return value.kind === 'dom' ? Object.keys(value).every((key) => ['kind', 'mode', 'nodeId', 'frameId', 'matrix'].includes(key))
    && Number.isSafeInteger(value.nodeId) && value.nodeId > 0 && (value.frameId === undefined || typeof value.frameId === 'string' && /^[A-Za-z0-9_-]{8,96}$/.test(value.frameId))
    : value.mode === 'scroll' && validId(value.editorId) && Object.keys(value).every((key) => ['kind', 'mode', 'editorId', 'matrix'].includes(key));
}
export function multiplyDrawingMatrix(a: DrawingMatrix, b: DrawingMatrix): DrawingMatrix {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
export function inverseDrawingMatrix(a: DrawingMatrix): DrawingMatrix | null {
  const det = a[0] * a[3] - a[1] * a[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-6) return null;
  return [a[3] / det, -a[1] / det, -a[2] / det, a[0] / det,
    (a[2] * a[5] - a[3] * a[4]) / det, (a[1] * a[4] - a[0] * a[5]) / det];
}
export function drawingPoint(matrix: DrawingMatrix, point: [number, number]): [number, number] {
  return [matrix[0] * point[0] + matrix[2] * point[1] + matrix[4], matrix[1] * point[0] + matrix[3] * point[1] + matrix[5]];
}
function transformClip(matrix: DrawingMatrix, clip: DrawingClip): DrawingClip {
  const corners = [[clip.x, clip.y], [clip.x + clip.width, clip.y], [clip.x, clip.y + clip.height], [clip.x + clip.width, clip.y + clip.height]]
    .map((point) => drawingPoint(matrix, point as [number, number]));
  const xs = corners.map((point) => point[0]); const ys = corners.map((point) => point[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
export function intersectDrawingClip(a: DrawingClip, b: DrawingClip): DrawingClip {
  const x = Math.max(a.x, b.x); const y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}
function viewport(doc: Document): DrawingClip { return { x: 0, y: 0, width: doc.defaultView!.innerWidth, height: doc.defaultView!.innerHeight }; }
function isPrivate(node: Element, container?: HTMLElement) {
  for (let current: Element | null = node; current && current !== container; current = current.parentElement) {
    if (current.matches(privateSelector)) return true;
  }
  return false;
}
function elementClip(node: Element, includeSelf = false, container?: HTMLElement): DrawingClip | null {
  const doc = node.ownerDocument; const win = doc.defaultView;
  if (!node.isConnected || !win || isPrivate(node, container)) return null;
  let clip = viewport(doc);
  for (let current: Element | null = node; current; current = current.parentElement) {
    const style = win.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return null;
    if ((current !== node || includeSelf) && current !== doc.documentElement && current !== doc.body) {
      const rect = current.getBoundingClientRect();
      const html = current as HTMLElement;
      const sx = rect.width / (html.offsetWidth || rect.width || 1); const sy = rect.height / (html.offsetHeight || rect.height || 1);
      const x = rect.x + (html.clientLeft || 0) * sx; const y = rect.y + (html.clientTop || 0) * sy;
      const width = (html.clientWidth || rect.width / sx) * sx; const height = (html.clientHeight || rect.height / sy) * sy;
      if (/(auto|scroll|hidden|clip|overlay)/.test(style.overflowX)) clip = intersectDrawingClip(clip, { x, y: clip.y, width, height: clip.height });
      if (/(auto|scroll|hidden|clip|overlay)/.test(style.overflowY)) clip = intersectDrawingClip(clip, { x: clip.x, y, width: clip.width, height });
    }
  }
  return clip;
}
function frameMatrix(frame: HTMLIFrameElement): DrawingMatrix {
  const rect = frame.getBoundingClientRect();
  const sx = rect.width / (frame.offsetWidth || 1); const sy = rect.height / (frame.offsetHeight || 1);
  return [sx, 0, 0, sy, rect.left + frame.clientLeft * sx, rect.top + frame.clientTop * sy];
}
function intoContainer(geometry: DrawingGeometry, owner: Window, container?: HTMLElement): DrawingGeometry | null {
  if (!container) return geometry;
  let current = owner;
  try {
    for (let depth = 0; current !== container.ownerDocument.defaultView && depth < 8; depth++) {
      const frame = current.frameElement as HTMLIFrameElement | null;
      if (!frame?.isConnected) return null;
      const matrix = frameMatrix(frame); const clip = elementClip(frame, true, container);
      if (!clip) return null;
      geometry = { matrix: multiplyDrawingMatrix(matrix, geometry.matrix), clip: intersectDrawingClip(transformClip(matrix, geometry.clip), clip) };
      current = frame.ownerDocument.defaultView!;
    }
    if (current !== container.ownerDocument.defaultView) return null;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const sx = container.clientWidth / rect.width; const sy = container.clientHeight / rect.height;
    const matrix: DrawingMatrix = [sx, 0, 0, sy, -rect.left * sx, -rect.top * sy];
    return { matrix: multiplyDrawingMatrix(matrix, geometry.matrix), clip: intersectDrawingClip(transformClip(matrix, geometry.clip),
      { x: 0, y: 0, width: container.clientWidth, height: container.clientHeight }) };
  } catch { return null; }
}
/** Geometry uses document content, scroll-container content, or an SVG canvas's local coordinate system. */
export function drawingNodeGeometry(node: Element, mode: DrawingAnchorMode, container?: HTMLElement): DrawingGeometry | null {
  const clip = elementClip(node, mode === 'scroll', container); const doc = node.ownerDocument;
  if (!clip) return null;
  let matrix: DrawingMatrix;
  if (mode === 'svg') {
    const ctm = (node as SVGGraphicsElement).getScreenCTM?.();
    if (!ctm) return null;
    matrix = [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f];
  } else if (mode === 'scroll' && (node === doc.scrollingElement || node === doc.documentElement || node === doc.body)) {
    matrix = [1, 0, 0, 1, -doc.defaultView!.scrollX, -doc.defaultView!.scrollY];
  } else {
    const html = node as HTMLElement; const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const sx = rect.width / (html.offsetWidth || rect.width); const sy = rect.height / (html.offsetHeight || rect.height);
    matrix = [sx, 0, 0, sy, rect.x, rect.y];
    if (mode === 'scroll') {
      matrix[4] += ((html.clientLeft || 0) - (html.scrollLeft || 0)) * sx;
      matrix[5] += ((html.clientTop || 0) - (html.scrollTop || 0)) * sy;
    }
  }
  if (!matrix.every(Number.isFinite) || !inverseDrawingMatrix(matrix)) return null;
  return intoContainer({ matrix, clip }, doc.defaultView!, container);
}
/** Safely compose geometry supplied by a controlled opaque child with its current frame placement. */
export function transformDrawingFrameGeometry(frame: HTMLIFrameElement, child: DrawingGeometry, container?: HTMLElement): DrawingGeometry | null {
  if (!frame.isConnected) return null;
  const clip = elementClip(frame, true, container); if (!clip) return null;
  const matrix = frameMatrix(frame);
  const frameClip = transformClip(matrix, { x: 0, y: 0, width: frame.clientWidth, height: frame.clientHeight });
  return intoContainer({ matrix: multiplyDrawingMatrix(matrix, child.matrix),
    clip: intersectDrawingClip(intersectDrawingClip(transformClip(matrix, child.clip), frameClip), clip) }, frame.ownerDocument.defaultView!, container);
}

function monacoFor(node: HTMLElement) {
  if (editors.has(node)) return editors.get(node);
  const win = node.ownerDocument.defaultView as any;
  const available = win.monaco?.editor?.getEditors?.() || [];
  return available.find((editor: any) => editor.getDomNode?.() === node) || (win.editor?.getDomNode?.() === node ? win.editor : null);
}
export function drawingEditorGeometry(node: HTMLElement, container: HTMLElement, offset?: number): DrawingGeometry | null {
  const geometry = drawingNodeGeometry(node, 'element', container);
  if (!geometry) return null;
  const editor = monacoFor(node); const layout = editor?.getLayoutInfo?.();
  const style = node.ownerDocument.defaultView!.getComputedStyle(node.querySelector('.view-lines') || node);
  const font = parseFloat(style.fontSize) || 15; const line = parseFloat(style.lineHeight) || font * 1.2;
  const left = (layout?.contentLeft ?? node.clientLeft) - (editor?.getScrollLeft?.() ?? node.scrollLeft);
  let top = node.clientTop - (editor?.getScrollTop?.() ?? node.scrollTop);
  if (offset !== undefined) {
    const model = editor?.getModel?.();
    if (!model || !Number.isSafeInteger(offset) || offset < 0 || offset > model.getValueLength()) return null;
    const position = model.getPositionAt(offset);
    // A saved stroke follows the code line, not a recycled .view-line node or
    // the line number it happened to occupy before another line was inserted.
    top += editor.getTopForPosition?.(position.lineNumber, 1) ?? editor.getTopForLineNumber(position.lineNumber);
  }
  const matrix = multiplyDrawingMatrix(geometry.matrix, [font, 0, 0, line, left, top]);
  // Freehand ink may circle a line number or extend left of the text. Its
  // coordinates still follow code scrolling, but the text column is not its
  // clipping boundary. Keep the whole editor viewport and its ancestor clips.
  const viewClip = transformClip(geometry.matrix, { x: node.clientLeft, y: node.clientTop,
    width: node.clientWidth, height: node.clientHeight });
  return { matrix, clip: intersectDrawingClip(geometry.clip, viewClip) };
}

export interface DrawingAnchorBinding { anchor?: DrawingAnchor; node?: Element; mode: DrawingAnchorMode; reference: DrawingMatrix; editor?: boolean }
/** Capture a stable content surface, rather than virtualized Monaco lines or the replay wrapper. */
export function captureDrawingAnchor(target: EventTarget | null, container: HTMLElement, resolvers?: DrawingAnchorResolvers): DrawingAnchorBinding | null {
  let node = target as Element | null;
  if (!node || node.nodeType !== 1 || isPrivate(node, container)) return null;
  const editorNode = node.closest<HTMLElement>('[data-live-share-editor]') || node.closest<HTMLElement>('.monaco-editor,textarea');
  if (editorNode) {
    const geometry = drawingEditorGeometry(editorNode, container); if (!geometry) return null;
    const editorId = editorNode.getAttribute('data-live-share-editor');
    const anchor: DrawingAnchor | undefined = validId(editorId) ? { kind: 'editor', mode: 'scroll', editorId, matrix: geometry.matrix } : undefined;
    return { anchor, node: editorNode, mode: 'scroll', reference: geometry.matrix, editor: true };
  }
  let mode: DrawingAnchorMode = 'element';
  const blocklySvg = node.closest('.blocklySvg');
  const canvas = node.closest('.blocklyBlockCanvas') || (blocklySvg && [...blocklySvg.querySelectorAll('.blocklyBlockCanvas')]
    .find((candidate) => candidate.closest('.blocklySvg') === blocklySvg && !candidate.closest('.blocklyFlyout')));
  if (canvas) { node = canvas; mode = 'svg'; }
  else {
    const doc = node.ownerDocument; const win = doc.defaultView!;
    for (let parent: Element | null = node; parent && parent !== doc.body && parent !== doc.documentElement; parent = parent.parentElement) {
      const style = win.getComputedStyle(parent);
      if ((parent.scrollHeight > parent.clientHeight + 1 && /(auto|scroll|overlay)/.test(style.overflowY))
        || (parent.scrollWidth > parent.clientWidth + 1 && /(auto|scroll|overlay)/.test(style.overflowX))) { node = parent; mode = 'scroll'; break; }
    }
    if (node === doc.body || node === doc.documentElement) { node = doc.scrollingElement || doc.documentElement; mode = 'scroll'; }
  }
  const geometry = drawingNodeGeometry(node, mode, container); if (!geometry) return null;
  const key = resolvers?.identify(node);
  const anchor: DrawingAnchor | undefined = key ? { kind: 'dom', mode, ...key, matrix: geometry.matrix } : undefined;
  return { anchor, node, mode, reference: geometry.matrix };
}
export function resolveDrawingAnchor(binding: DrawingAnchorBinding, container: HTMLElement, resolvers?: DrawingAnchorResolvers): DrawingGeometry | null {
  const { anchor } = binding;
  if (anchor?.kind === 'editor') {
    let node = binding.node as HTMLElement | undefined;
    if (!node?.isConnected) node = [...editors.keys()].find((candidate) => candidate.isConnected && candidate.getAttribute('data-live-share-editor') === anchor.editorId);
    if (!node) node = container.ownerDocument.querySelector<HTMLElement>(`[data-live-share-editor="${anchor.editorId}"]`) || undefined;
    return node ? drawingEditorGeometry(node, container) : null;
  }
  if (binding.editor) return binding.node?.isConnected ? drawingEditorGeometry(binding.node as HTMLElement, container) : null;
  let node = binding.node;
  if (anchor?.kind === 'dom') node = resolvers?.resolve({ nodeId: anchor.nodeId, ...(anchor.frameId ? { frameId: anchor.frameId } : {}) }) || undefined;
  if (node?.isConnected) return drawingNodeGeometry(node, binding.mode, container);
  if (anchor?.kind === 'dom' && anchor.frameId && resolvers?.frameGeometry) {
    const geometry = resolvers.frameGeometry(anchor);
    return geometry ? intoContainer(geometry, container.ownerDocument.defaultView!, container) : null;
  }
  return null;
}

export function drawingAnchorTransform(reference: DrawingMatrix, current: DrawingMatrix): DrawingMatrix {
  const inverse = inverseDrawingMatrix(reference);
  return inverse ? multiplyDrawingMatrix(current, inverse) : identity.slice() as DrawingMatrix;
}
