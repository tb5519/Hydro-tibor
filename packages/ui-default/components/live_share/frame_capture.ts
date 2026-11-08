import { attachSourceMirror } from './mirror';
import { attachTemporaryDrawing } from './drawing';
import { DrawingAnchorMode, drawingNodeGeometry } from './drawing_anchor';

/** Loaded only by our controlled Scratch HTML; it never grants parent access to the sandbox. */
export function installFrameCapture() {
  if (parent === window) return () => {};
  const channel = new URLSearchParams(location.hash.slice(1)).get('channel');
  if (!channel || !/^[a-zA-Z0-9_-]{8,96}$/.test(channel)) return () => {};
  const parentOrigin = new URL(location.href).origin;
  let id = '';
  let lease = 0;
  let capture: ReturnType<typeof attachSourceMirror> | undefined;
  let drawing: ReturnType<typeof attachTemporaryDrawing> | undefined;
  let drawingRoot: HTMLElement | undefined;
  let drawingLease = 0;
  const geometry = new Map<string, { nodeId: number; mode: DrawingAnchorMode; expires: number; sent: number; signature: string }>();
  const stopDrawing = () => { drawing?.dispose(); drawing = undefined; drawingRoot?.remove(); drawingRoot = undefined; drawingLease = 0; };
  const stop = () => { capture?.dispose(); capture = undefined; geometry.clear(); id = ''; };
  const publishGeometry = () => {
    if (!capture || !id || Date.now() >= lease) return;
    const now = Date.now();
    for (const [key, entry] of geometry) {
      if (now >= entry.expires) { geometry.delete(key); continue; }
      const node = capture.getDrawingNode(entry.nodeId);
      const value = node ? drawingNodeGeometry(node, entry.mode) : null;
      const signature = JSON.stringify(value);
      if (signature === entry.signature && now - entry.sent < 500) continue;
      entry.signature = signature; entry.sent = now;
      parent.postMessage({ type: 'live-share-frame-geometry', channel, id,
        nodeId: entry.nodeId, mode: entry.mode, geometry: value }, parentOrigin);
    }
  };
  const receive = (event: MessageEvent) => {
    const message = event.data;
    if (event.source === parent && event.origin === parentOrigin && message?.channel === channel && message.type === 'live-share-local-drawing') {
      if (message.enabled === false) { stopDrawing(); return; }
      if (message.enabled !== true) return;
      drawingLease = Date.now() + 12000;
      if (!drawing) {
        drawingRoot = document.createElement('div');
        drawingRoot.dataset.liveShareUi = ''; drawingRoot.dataset.liveSharePrivate = '';
        drawingRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147482000';
        document.documentElement.append(drawingRoot);
        drawing = attachTemporaryDrawing({ container: drawingRoot, teacher: true, pageId: 'local-scratch-drawing', scopeDocument: true,
          ...(Array.isArray(message.annotationDrafts) ? { annotationStore: {
            read: () => message.annotationDrafts.slice(0, 32),
            write: (drafts: unknown[]) => { if (Date.now() < drawingLease) parent.postMessage({ type: 'live-share-local-drawing-cache', channel, drafts }, parentOrigin); },
          } } : {}),
          anchors: {
            identify: (node) => { const nodeId = capture?.getDrawingNodeId(node); return nodeId ? { nodeId } : null; },
            resolve: (identity) => capture?.getDrawingNode(identity.nodeId) || null,
          },
          send: (packet) => { if (capture && id && Date.now() < lease && Date.now() < drawingLease) {
            parent.postMessage({ type: 'live-share-frame-drawing', channel, id, packet }, parentOrigin);
          } } });
      }
      return;
    }
    if (event.source !== parent || event.origin !== parentOrigin || message?.channel !== channel
      || message.type !== 'live-share-capture' || !/^[a-zA-Z0-9_-]{8,96}$/.test(message.id || '')) return;
    if (message.action === 'stop') { if (id === message.id) stop(); return; }
    if (message.action === 'command') {
      if (capture && id === message.id && Date.now() < lease) capture.receiveCommand(message.command);
      return;
    }
    if (message.action === 'geometry') {
      if (!capture || id !== message.id || Date.now() >= lease || !Number.isSafeInteger(message.nodeId) || message.nodeId < 1
        || !['element', 'scroll', 'svg'].includes(message.mode)) return;
      const key = `${message.nodeId}:${message.mode}`;
      let entry = geometry.get(key);
      if (!entry) {
        if (geometry.size >= 32) geometry.delete(geometry.keys().next().value);
        entry = { nodeId: message.nodeId, mode: message.mode, expires: 0, sent: 0, signature: '' };
        geometry.set(key, entry);
      }
      entry.expires = Date.now() + 4000;
      publishGeometry();
      return;
    }
    if (!['start', 'snapshot'].includes(message.action)) return;
    lease = Date.now() + 12000;
    if (capture && id === message.id) { if (message.action === 'snapshot') { capture.snapshot(); drawing?.snapshot(); } return; }
    stop(); id = message.id;
    const capturedId = id;
    let failed = false;
    parent.postMessage({ type: 'live-share-frame-start', channel, id }, parentOrigin);
    capture = attachSourceMirror({ pageId: id, inlineLocalImages: true, showNonSensitiveInputs: true, scratchControls: true,
      onStatus: (status) => {
        if (failed || id !== capturedId || Date.now() >= lease
          || !/(?:同步中断|已暂停.*重新连接)/.test(status)) return;
        // A stopped recorder cannot be revived by renewing its lease. Ask the
        // authenticated parent for a fresh epoch, without reusing old node IDs.
        failed = true;
        parent.postMessage({ type: 'live-share-frame-status', channel, id, code: 'RECORDER_STOPPED' }, parentOrigin);
      },
      sendAck: (ack) => {
        if (id === capturedId && Date.now() < lease) parent.postMessage({ type: 'live-share-frame-ack', channel, id, ack }, parentOrigin);
      },
      beforeRasterCapture: (canvas) => {
        // Scratch's WebGL buffer is discarded after presentation. Redraw only
        // its existing scene immediately before sampling; never advance the VM.
        const renderer = (window as any).ReduxStore?.getState?.()?.scratchGui?.vm?.renderer;
        if (renderer?.canvas === canvas && typeof renderer.draw === 'function') {
          // TurboWarp skips draw() when this display-only flag is clear.
          // It is unrelated to project edits or the unsaved-work indicator.
          renderer.dirty = true;
          renderer.draw();
        }
      },
      send: (packet) => {
        if (failed || id !== capturedId || Date.now() >= lease) return false;
        parent.postMessage({ type: 'live-share-frame', channel, id, packet }, parentOrigin);
        return true;
      } });
  };
  window.addEventListener('message', receive);
  const geometryTimer = window.setInterval(publishGeometry, 32);
  const timer = window.setInterval(() => { if (capture && Date.now() >= lease) stop(); if (drawing && Date.now() >= drawingLease) stopDrawing(); }, 1000);
  const hidden = (event: PageTransitionEvent) => { if (event.persisted) { stop(); stopDrawing(); } else dispose(); };
  const dispose = () => { stop(); stopDrawing(); clearInterval(timer); clearInterval(geometryTimer); window.removeEventListener('message', receive); window.removeEventListener('pagehide', hidden); };
  window.addEventListener('pagehide', hidden);
  return dispose;
}

installFrameCapture();
