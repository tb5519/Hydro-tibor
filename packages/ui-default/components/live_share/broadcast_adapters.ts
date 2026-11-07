import { attachSourceMirror, attachViewerMirror } from './mirror';
import { attachSourceEditors, attachViewerEditors } from './editor';
import { attachSourceFrames, attachViewerFrames } from './frames';
import { attachSourceIde, attachViewerIde } from './ide';
import { attachTemporaryDrawing, DrawingPacket, DrawingRole } from './drawing';
import { attachBroadcastFocus, BroadcastFocus } from './broadcast_focus';

export type BroadcastKind = 'mirror' | 'editor' | 'drawing' | 'annotation';
interface CommonOptions { pageId: string; onStatus?: (message: string) => void; annotationScope?: { sessionId: string; url: string } }

/** The teacher stays on their real page. Receivers have no command/edit channel back to it. */
export function attachBroadcastSource(options: CommonOptions & {
  send: (kind: BroadcastKind, data: any) => boolean | void;
}) {
  const focus = attachBroadcastFocus((rect) => options.send('mirror', { type: 'broadcast-focus', ...rect }));
  const editors = attachSourceEditors({ pageId: options.pageId, teacherSource: true, annotationScope: options.annotationScope,
    send: (data) => options.send('editor', data), onStatus: (status) => { if (status.error) options.onStatus?.(status.error); } });
  const frames = attachSourceFrames({ pageId: options.pageId, send: (data) => {
    focus.captureFrame(data, (id, x, y) => frames.getPointerPosition(id, x, y));
    return options.send('mirror', data);
  },
    sendDrawing: (data) => options.send('drawing', data), onStatus: options.onStatus });
  const mirror = attachSourceMirror({ pageId: options.pageId, teacherAnnotations: true, annotationScope: options.annotationScope,
    send: (data) => options.send('mirror', data), sendAck: () => {},
    sendAnnotation: (data) => options.send('annotation', data), onStatus: options.onStatus });
  const drawingRoot = document.createElement('div');
  drawingRoot.dataset.liveShareUi = ''; drawingRoot.dataset.liveSharePrivate = '';
  drawingRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147482000';
  document.body.append(drawingRoot);
  const drawing = attachTemporaryDrawing({ pageId: options.pageId, container: drawingRoot, teacher: true, scopeDocument: true, onlyOwnNotes: true, annotationScope: options.annotationScope,
    anchors: {
      identify: (node) => { const nodeId = mirror.getDrawingNodeId(node); return nodeId ? { nodeId } : null; },
      resolve: (identity) => identity.frameId ? null : mirror.getDrawingNode(identity.nodeId),
      frameGeometry: (anchor) => frames.getDrawingGeometry(anchor),
    }, send: (data) => options.send('drawing', data) });
  const ide = attachSourceIde({ pageId: options.pageId, send: (data) => options.send('mirror', data), sendAck: () => {} });
  let disposed = false;
  return {
    receive(kind: BroadcastKind, data: any) {
      // Student ink is already fanned out by the server: render it, never relay it again.
      if (!disposed && kind === 'drawing') drawing.receive(data, 'student');
    },
    snapshot() { if (!disposed) { mirror.snapshot(); editors.snapshot?.(); frames.snapshot(); ide.snapshot(); drawing.snapshot(); focus.snapshot(); } },
    setConnected(value: boolean) {
      if (disposed) return;
      mirror.setConnected(value); editors.setConnected(value); frames.setConnected(value); drawing.setConnected(value); ide.setConnected(value); focus.setConnected(value);
    },
    dispose() {
      if (disposed) return; disposed = true;
      mirror.dispose(); editors.dispose(); frames.dispose(); drawing.dispose(); ide.dispose(); focus.dispose(); drawingRoot.remove();
    },
  };
}

/** Display-only replica; a learner's sole outgoing interaction is a temporary left-button pen. */
export function attachBroadcastViewer(options: CommonOptions & {
  container: HTMLElement; sendDrawing: (packet: DrawingPacket) => void;
  onViewport?: (size: { width: number; height: number }) => void;
  onFocus?: (focus: BroadcastFocus) => void;
  onViewWheel?: (event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'shiftKey'>) => void;
}) {
  const root = document.createElement('div');
  root.dataset.liveShareUi = ''; root.dataset.liveShareViewer = 'true';
  root.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:auto';
  const mirrorRoot = document.createElement('div'); const editorRoot = document.createElement('div'); const frameRoot = document.createElement('div');
  for (const layer of [mirrorRoot, frameRoot, editorRoot]) layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  root.append(mirrorRoot, frameRoot, editorRoot); options.container.append(root);
  const mirror = attachViewerMirror({ pageId: options.pageId, container: mirrorRoot, readOnly: true,
    sendCommand: () => {}, onViewport: options.onViewport, onViewWheel: options.onViewWheel, onStatus: options.onStatus });
  const frames = attachViewerFrames({ pageId: options.pageId, container: frameRoot, readOnly: true,
    getNodeRect: (id) => mirror.getFrameRect(id), onStatus: options.onStatus });
  const editors = attachViewerEditors({ pageId: options.pageId, container: editorRoot, readOnly: true,
    getNodeRect: (id) => mirror.getEditorRect(id) || undefined,
    send: () => {}, onStatus: (status) => { if (status.error) options.onStatus?.(status.error); } });
  const ide = attachViewerIde({ pageId: options.pageId, container: root, readOnly: true, sendCommand: () => {} });
  const drawing = attachTemporaryDrawing({ pageId: options.pageId, container: root, teacher: true, inputButton: 0, allowNotes: false, penRole: 'student',
    anchors: {
      identify: (node) => { const nodeId = mirror.getDrawingNodeId(node); return nodeId ? { nodeId } : frames.getDrawingNodeId(node); },
      resolve: (identity) => identity.frameId ? frames.getDrawingNode(identity) : mirror.getDrawingNode(identity.nodeId),
    }, send: options.sendDrawing });
  // Mirrors have their own sandbox-document guards. This also closes the overlay/editor/IDE surface
  // so a click, key, drop or wheel can never act on either the teacher or the learner's hidden draft.
  const blockedEvents = ['click', 'dblclick', 'auxclick', 'submit', 'keydown', 'keyup', 'input', 'change', 'wheel', 'touchstart', 'dragstart', 'drop'];
  const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  for (const name of blockedEvents) root.addEventListener(name, block, { capture: true, passive: false });
  let disposed = false;
  return {
    receive(kind: BroadcastKind, data: any, role: DrawingRole = 'teacher') {
      if (disposed) return;
      if (kind === 'editor') editors.receive(data);
      else if (kind === 'drawing') drawing.receive(data, role);
      else if (kind === 'annotation') mirror.receiveAnnotation(data);
      else if (kind === 'mirror') {
        if (data?.type === 'broadcast-focus') {
          if (['x', 'y', 'width', 'height'].every((key) => Number.isFinite(data[key]) && data[key] >= 0 && data[key] <= 16384)
            && data.width > 0 && data.height > 0) options.onFocus?.(data);
        } else if (data?.type === 'ide') ide.receive(data);
        else if (data?.type === 'frame' || data?.type === 'frame-remove') frames.receive(data);
        else mirror.receive(data);
      }
    },
    setConnected(value: boolean) {
      if (disposed) return;
      mirror.setConnected(value); editors.setConnected(value); frames.setConnected(value); drawing.setConnected(value); ide.setConnected(value);
    },
    dispose() {
      if (disposed) return; disposed = true;
      mirror.dispose(); editors.dispose(); frames.dispose(); drawing.dispose(); ide.dispose();
      for (const name of blockedEvents) root.removeEventListener(name, block, true);
      root.remove();
    },
  };
}
