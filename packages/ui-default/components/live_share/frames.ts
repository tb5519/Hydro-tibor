import { attachViewerMirror, MirrorCommand, MirrorAck } from './mirror';
import { DrawingPacket, validDrawingPacket } from './drawing';
import { validScratchInput } from './scratch_control';
import { DrawingAnchor, DrawingAnchorMode, DrawingGeometry, DrawingNodeIdentity, DrawingMatrix, drawingPoint, multiplyDrawingMatrix, transformDrawingFrameGeometry } from './drawing_anchor';

const MARKER = 'data-live-share-frame';
const MAX_FRAMES = 4;
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(id);
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
type Rect = { x: number; y: number; width: number; height: number };
export interface FrameCommand { id: string; pageId: string; nodeId: number; action: 'frame'; frameId: string; command: MirrorCommand }
interface SourceOptions { pageId: string; send: (data: any) => void | boolean; sendAck?: (data: MirrorAck) => void; sendDrawing?: (data: DrawingPacket) => void; onStatus?: (message: string) => void }
interface SourceFrame { id: string; frame: HTMLIFrameElement; channel: string; href: string; previousMarker: string | null; started?: boolean; loaded: () => void }

/** Only our opaque-origin Scratch runtime implements this authenticated bridge. */
function controlledFrame(frame: HTMLIFrameElement, allowOffscreen = false) {
  if (!frame.isConnected || frame.closest('[data-live-share-viewer],.live-share-overlay')) return null;
  try {
    const url = new URL(frame.src, location.href);
    const channel = new URLSearchParams(url.hash.slice(1)).get('channel');
    if (url.origin !== location.origin || url.pathname !== '/scratch-editor/editor.html' || !validId(channel)
      || !frame.sandbox.contains('allow-scripts') || frame.sandbox.contains('allow-same-origin')) return null;
    const rect = frame.getBoundingClientRect();
    const style = getComputedStyle(frame);
    if (!frame.getClientRects().length || rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden'
      || (!allowOffscreen && (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth))) return null;
    return { href: url.href, channel };
  } catch { return null; }
}

export function attachSourceFrames(options: SourceOptions) {
  const bindings = new Map<HTMLIFrameElement, SourceFrame>();
  const geometry = new Map<string, { frameId: string; nodeId: number; mode: DrawingAnchorMode; requested: number; received: number; value: DrawingGeometry | null }>();
  const pending = new Map<string, { outerId: string; frameId: string; at: number }>();
  const inkFrames = new Map<string, { frameId: string; matrix: DrawingMatrix; expires: number }>();
  let connected = true;
  let disposed = false;
  const post = (binding: SourceFrame, action: 'start' | 'stop' | 'snapshot') => {
    binding.frame.contentWindow?.postMessage({ type: 'live-share-capture', action, channel: binding.channel, id: binding.id }, '*');
  };
  const remove = (binding: SourceFrame) => {
    post(binding, 'stop');
    binding.frame.removeEventListener('load', binding.loaded);
    if (binding.frame.getAttribute(MARKER) === binding.id) {
      if (binding.previousMarker === null) binding.frame.removeAttribute(MARKER);
      else binding.frame.setAttribute(MARKER, binding.previousMarker);
    }
    bindings.delete(binding.frame);
    for (const [strokeId, ink] of inkFrames) if (ink.frameId === binding.id) inkFrames.delete(strokeId);
    for (const [key, entry] of pending) if (entry.frameId === binding.id) pending.delete(key);
    for (const [key, entry] of geometry) if (entry.frameId === binding.id) geometry.delete(key);
    if (connected) options.send({ type: 'frame-remove', id: binding.id });
  };
  const scan = () => {
    if (disposed || !connected) return;
    for (const binding of bindings.values()) {
      // Moving the parent page offscreen must not rotate this recorder epoch:
      // pinned marks need the same node IDs when the teacher scrolls back.
      const current = controlledFrame(binding.frame, true);
      if (!current || current.href !== binding.href) remove(binding);
    }
    for (const frame of document.querySelectorAll<HTMLIFrameElement>('iframe[src]')) {
      if (bindings.size >= MAX_FRAMES) break;
      if (bindings.has(frame)) continue;
      const info = controlledFrame(frame);
      if (!info) continue;
      const binding: SourceFrame = { frame, id: randomId(), ...info, previousMarker: frame.getAttribute(MARKER),
        loaded: () => { remove(binding); scan(); } };
      bindings.set(frame, binding);
      frame.setAttribute(MARKER, binding.id);
      frame.addEventListener('load', binding.loaded);
      post(binding, 'start');
    }
  };
  const receive = (event: MessageEvent) => {
    if (disposed || !connected || event.origin !== 'null' || !['live-share-frame', 'live-share-frame-start', 'live-share-frame-ack', 'live-share-frame-geometry', 'live-share-frame-drawing'].includes(event.data?.type)) return;
    const binding = [...bindings.values()].find((item) => event.source === item.frame.contentWindow
      && event.data.channel === item.channel && event.data.id === item.id);
    if (!binding || !controlledFrame(binding.frame, true)) return;
    if (event.data.type === 'live-share-frame-drawing') {
      const packet = event.data.packet;
      if (!options.sendDrawing || !validDrawingPacket(packet) || packet.anchor?.kind === 'editor') return;
      if (packet.phase === 'start' && !inkFrames.has(packet.strokeId)) {
        for (const [strokeId, state] of inkFrames) if (Date.now() > state.expires) inkFrames.delete(strokeId);
        if (inkFrames.size >= 128) return;
        const rect = binding.frame.getBoundingClientRect();
        const sx = rect.width / (binding.frame.offsetWidth || 1); const sy = rect.height / (binding.frame.offsetHeight || 1);
        inkFrames.set(packet.strokeId, { frameId: binding.id, expires: Date.now() + 60000, matrix: [sx, 0, 0, sy,
          rect.x + binding.frame.clientLeft * sx, rect.y + binding.frame.clientTop * sy] });
      }
      const ink = inkFrames.get(packet.strokeId);
      if (!ink || ink.frameId !== binding.id) return;
      if (packet.phase === 'note') ink.expires = Infinity;
      else if (packet.phase === 'end' && ink.expires !== Infinity) ink.expires = Date.now() + 12000;
      const coordinate = (point: [number, number]) => drawingPoint(ink.matrix, point).map((n) => Math.max(0, Math.min(10000, n))) as [number, number];
      const converted: DrawingPacket = { ...packet, points: packet.points.map(coordinate) };
      if (packet.anchor?.kind === 'dom') converted.anchor = { ...packet.anchor, frameId: binding.id,
        matrix: multiplyDrawingMatrix(ink.matrix, packet.anchor.matrix) };
      if (packet.note) {
        const [x, y] = coordinate([packet.note.x, packet.note.y]);
        converted.note = { ...packet.note, x, y, width: Math.max(36, Math.min(960, packet.note.width * ink.matrix[0])),
          height: Math.max(36, Math.min(800, packet.note.height * ink.matrix[3])) };
      }
      if (validDrawingPacket(converted)) options.sendDrawing(converted);
      if (packet.phase === 'delete') inkFrames.delete(packet.strokeId);
      return;
    }
    if (event.data.type === 'live-share-frame-geometry') {
      const message = event.data;
      const entry = geometry.get(`${binding.id}:${message.nodeId}:${message.mode}`);
      if (!entry || Date.now() - entry.requested > 4000) return;
      const value = message.geometry;
      if (value !== null && (!value || !Array.isArray(value.matrix) || value.matrix.length !== 6
        || !value.matrix.every((n: any, index: number) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= (index < 4 ? 100 : 10000000))
        || Math.abs(value.matrix[0] * value.matrix[3] - value.matrix[1] * value.matrix[2]) < 1e-6
        || !value.clip || !['x', 'y', 'width', 'height'].every((key) => typeof value.clip[key] === 'number'
          && Number.isFinite(value.clip[key]) && Math.abs(value.clip[key]) <= 10000000)
        || value.clip.width < 0 || value.clip.height < 0)) return;
      entry.received = Date.now();
      entry.value = value === null ? null : { matrix: [...value.matrix] as DrawingGeometry['matrix'],
        clip: { x: value.clip.x, y: value.clip.y, width: value.clip.width, height: value.clip.height } };
      return;
    }
    if (event.data.type === 'live-share-frame-ack') {
      const ack = event.data.ack; const entry = pending.get(ack?.id);
      if (!entry || entry.frameId !== binding.id || ack.pageId !== binding.id || typeof ack.ok !== 'boolean') return;
      pending.delete(ack.id);
      options.sendAck?.({ id: entry.outerId, pageId: options.pageId, ok: ack.ok,
        ...(typeof ack.reason === 'string' ? { reason: ack.reason.slice(0, 512) } : {}) });
      return;
    }
    // A child can renew after its lease expired without its iframe reloading.
    // Its new recorder starts at sequence 1, so discard the old replay epoch.
    if (event.data.type === 'live-share-frame-start') {
      // A new recorder must also get a new command epoch. Otherwise queued
      // commands could target reused node IDs after a child lease expires.
      if (binding.started) { remove(binding); scan(); }
      else { binding.started = true; options.send({ type: 'frame-remove', id: binding.id }); }
      return;
    }
    const packet = event.data.packet;
    if (!packet || !['rrweb', 'rrweb-chunk', 'rrweb-batch'].includes(packet.type)
      || !Number.isSafeInteger(packet.sequence) || packet.sequence < 0) return;
    // Nested mirror packets have the same transport budget as the main page.
    // Server validation and the viewer sanitizer remain the final boundaries.
    try {
      if (JSON.stringify(packet).length > 350 * 1024) return;
      options.send({ type: 'frame', id: binding.id, packet });
    } catch { options.onStatus?.('Scratch 画面同步暂时中断，正在等待连接恢复。'); }
  };
  window.addEventListener('message', receive);
  scan();
  const scanTimer = window.setInterval(scan, 200);
  const keepaliveTimer = window.setInterval(() => {
    if (connected) for (const binding of bindings.values()) post(binding, 'start');
    for (const [id, entry] of pending) if (Date.now() - entry.at > 5000) pending.delete(id);
  }, 4000);
  return {
    getDrawingGeometry(anchor: DrawingAnchor): DrawingGeometry | null {
      if (disposed || !connected || anchor?.kind !== 'dom' || !validId(anchor.frameId)
        || !Number.isSafeInteger(anchor.nodeId) || anchor.nodeId < 1 || !['element', 'scroll', 'svg'].includes(anchor.mode)) return null;
      const binding = [...bindings.values()].find((item) => item.id === anchor.frameId);
      if (!binding?.started || !controlledFrame(binding.frame, true)) return null;
      const key = `${binding.id}:${anchor.nodeId}:${anchor.mode}`;
      let entry = geometry.get(key);
      if (!entry) {
        if (geometry.size >= 32) geometry.delete(geometry.keys().next().value);
        entry = { frameId: binding.id, nodeId: anchor.nodeId, mode: anchor.mode, requested: 0, received: 0, value: null };
        geometry.set(key, entry);
      }
      if (Date.now() - entry.requested >= 1000) {
        entry.requested = Date.now();
        binding.frame.contentWindow?.postMessage({ type: 'live-share-capture', action: 'geometry', channel: binding.channel,
          id: binding.id, nodeId: anchor.nodeId, mode: anchor.mode }, '*');
      }
      // Geometry is read in the opaque child, never guessed from the mirror.
      // An expired lease or removed node hides the mark until it resolves again.
      if (!entry.value || Date.now() - entry.received > 1500) return null;
      return transformDrawingFrameGeometry(binding.frame, entry.value);
    },
    receiveCommand(envelope: FrameCommand) {
      const deny = () => options.sendAck?.({ id: envelope?.id || '', pageId: options.pageId, ok: false, reason: 'Scratch 页面已变化，请等待同步' });
      const command = envelope?.command;
      const binding = [...bindings.values()].find((item) => item.id === envelope?.frameId);
      if (disposed || !connected || envelope?.action !== 'frame' || envelope.pageId !== options.pageId || !validId(envelope.id)
        || !binding || !controlledFrame(binding.frame) || command?.pageId !== binding.id || command.action !== 'scratch'
        || !validId(command.id) || !Number.isSafeInteger(command.nodeId) || command.nodeId < 1
        || typeof command.target !== 'string' || command.target.length > 32 || !validScratchInput(command.input)) { deny(); return; }
      if (pending.size >= 256) pending.delete(pending.keys().next().value);
      pending.set(command.id, { outerId: envelope.id, frameId: binding.id, at: Date.now() });
      binding.frame.contentWindow?.postMessage({ type: 'live-share-capture', action: 'command', channel: binding.channel, id: binding.id, command }, '*');
    },
    snapshot() { if (connected) for (const binding of bindings.values()) post(binding, 'snapshot'); },
    setConnected(value: boolean) {
      if (connected === value) return;
      connected = value;
      if (!value) { for (const binding of [...bindings.values()]) remove(binding); pending.clear(); geometry.clear(); }
      if (value) { scan(); for (const binding of bindings.values()) post(binding, 'start'); }
    },
    dispose() {
      if (disposed) return;
      disposed = true; connected = false;
      pending.clear(); geometry.clear();
      clearInterval(scanTimer); clearInterval(keepaliveTimer); window.removeEventListener('message', receive);
      for (const binding of [...bindings.values()]) remove(binding);
    },
  };
}

interface ViewerOptions {
  readOnly?: boolean;
  pageId: string; container: HTMLElement; getNodeRect: (id: string) => Rect | null | undefined;
  sendCommand?: (data: FrameCommand) => void;
  onViewZoom?: (gesture: { delta: number; clientX: number; clientY: number }) => void;
  onViewPan?: (gesture: { dx: number; dy: number }) => void;
  onStatus?: (message: string) => void;
}
export function attachViewerFrames(options: ViewerOptions) {
  const bindings = new Map<string, { node: HTMLElement; stage: HTMLElement; mirror: ReturnType<typeof attachViewerMirror>; viewport?: { width: number; height: number } }>();
  let connected = true;
  let disposed = false;
  let frame = 0;
  const layout = () => {
    if (disposed) return;
    for (const [id, binding] of bindings) {
      const rect = options.getNodeRect(id);
      if (!connected || !rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
        binding.node.hidden = true; continue;
      }
      binding.node.hidden = false;
      Object.assign(binding.node.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      const viewport = binding.viewport;
      if (viewport) Object.assign(binding.stage.style, { width: `${viewport.width}px`, height: `${viewport.height}px`,
        transform: `scale(${rect.width / viewport.width},${rect.height / viewport.height})` });
    }
    frame = requestAnimationFrame(layout);
  };
  frame = requestAnimationFrame(layout);
  return {
    getDrawingNodeId(node: Element): DrawingNodeIdentity | null {
      if (disposed || !connected) return null;
      for (const [frameId, binding] of bindings) {
        const nodeId = binding.mirror.getDrawingNodeId(node);
        if (nodeId !== null) return { nodeId, frameId };
      }
      return null;
    },
    getDrawingNode(identity: DrawingNodeIdentity): Element | null {
      if (disposed || !connected || !validId(identity?.frameId)) return null;
      return bindings.get(identity.frameId)?.mirror.getDrawingNode(identity.nodeId) || null;
    },
    receive(data: any) {
      if (disposed || !connected || !validId(data?.id)) return;
      if (data.type === 'frame-remove') {
        const old = bindings.get(data.id); old?.mirror.dispose(); old?.node.remove(); bindings.delete(data.id); return;
      }
      if (data.type !== 'frame' || !data.packet || !['rrweb', 'rrweb-chunk', 'rrweb-batch'].includes(data.packet.type)) return;
      let binding = bindings.get(data.id);
      if (!binding) {
        if (bindings.size >= MAX_FRAMES) return;
        const node = document.createElement('div');
        node.dataset.liveShareFrameViewer = data.id;
        node.setAttribute('aria-label', '学员的 Scratch 实时画面');
        node.style.cssText = `position:absolute;overflow:hidden;pointer-events:${options.sendCommand || options.readOnly ? 'auto' : 'none'};background:#eaf1fb`;
        node.hidden = true;
        const stage = document.createElement('div');
        stage.style.cssText = `position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:${options.sendCommand || options.readOnly ? 'auto' : 'none'}`;
        node.append(stage); options.container.append(node);
        binding = { node, stage, mirror: undefined as any };
        bindings.set(data.id, binding);
        binding.mirror = attachViewerMirror({ pageId: data.id, container: stage, readOnly: options.readOnly, scratchControls: !!options.sendCommand && !options.readOnly,
          sendCommand: (command) => {
            if (disposed || !connected || !bindings.has(data.id) || command.action !== 'scratch') return;
            options.sendCommand?.({ id: command.id, pageId: options.pageId, nodeId: 1, action: 'frame', frameId: data.id, command });
          }, onViewZoom: options.onViewZoom, onViewPan: options.onViewPan,
          onViewport: (size) => { if (binding) binding.viewport = size; }, onStatus: options.onStatus });
      }
      binding.mirror.receive(data.packet);
    },
    setConnected(value: boolean) {
      connected = value;
      if (!value) {
        // Source frame IDs rotate on reconnect; discard the old inert documents
        // and their interactions instead of leaving hidden stale frames around.
        for (const binding of bindings.values()) { binding.mirror.dispose(); binding.node.remove(); }
        bindings.clear();
      }
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame);
      for (const binding of bindings.values()) { binding.mirror.dispose(); binding.node.remove(); }
      bindings.clear();
    },
  };
}
