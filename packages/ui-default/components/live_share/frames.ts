import { attachViewerMirror } from './mirror';

const MARKER = 'data-live-share-frame';
const MAX_FRAMES = 4;
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(id);
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
type Rect = { x: number; y: number; width: number; height: number };
interface SourceOptions { pageId: string; send: (data: any) => void | boolean; onStatus?: (message: string) => void }
interface SourceFrame { id: string; frame: HTMLIFrameElement; channel: string; href: string; previousMarker: string | null; loaded: () => void }

/** Only our opaque-origin Scratch runtime implements this display-only bridge. */
function controlledFrame(frame: HTMLIFrameElement) {
  if (!frame.isConnected || frame.closest('[data-live-share-viewer],.live-share-overlay')) return null;
  try {
    const url = new URL(frame.src, location.href);
    const channel = new URLSearchParams(url.hash.slice(1)).get('channel');
    if (url.origin !== location.origin || url.pathname !== '/scratch-editor/editor.html' || !validId(channel)
      || !frame.sandbox.contains('allow-scripts') || frame.sandbox.contains('allow-same-origin')) return null;
    const rect = frame.getBoundingClientRect();
    const style = getComputedStyle(frame);
    if (!frame.getClientRects().length || rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden'
      || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) return null;
    return { href: url.href, channel };
  } catch { return null; }
}

export function attachSourceFrames(options: SourceOptions) {
  const bindings = new Map<HTMLIFrameElement, SourceFrame>();
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
    if (connected) options.send({ type: 'frame-remove', id: binding.id });
  };
  const scan = () => {
    if (disposed || !connected) return;
    for (const binding of bindings.values()) {
      const current = controlledFrame(binding.frame);
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
    if (disposed || !connected || event.origin !== 'null' || !['live-share-frame', 'live-share-frame-start'].includes(event.data?.type)) return;
    const binding = [...bindings.values()].find((item) => event.source === item.frame.contentWindow
      && event.data.channel === item.channel && event.data.id === item.id);
    if (!binding || !controlledFrame(binding.frame)) return;
    // A child can renew after its lease expired without its iframe reloading.
    // Its new recorder starts at sequence 1, so discard the old replay epoch.
    if (event.data.type === 'live-share-frame-start') { options.send({ type: 'frame-remove', id: binding.id }); return; }
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
  }, 4000);
  return {
    snapshot() { if (connected) for (const binding of bindings.values()) post(binding, 'snapshot'); },
    setConnected(value: boolean) {
      if (connected === value) return;
      if (!value) for (const binding of bindings.values()) post(binding, 'stop');
      connected = value;
      if (value) { scan(); for (const binding of bindings.values()) post(binding, 'start'); }
    },
    dispose() {
      if (disposed) return;
      disposed = true; connected = false;
      clearInterval(scanTimer); clearInterval(keepaliveTimer); window.removeEventListener('message', receive);
      for (const binding of [...bindings.values()]) remove(binding);
    },
  };
}

interface ViewerOptions {
  pageId: string; container: HTMLElement; getNodeRect: (id: string) => Rect | null | undefined;
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
        node.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none;background:#eaf1fb';
        node.hidden = true;
        const stage = document.createElement('div');
        stage.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none';
        node.append(stage); options.container.append(node);
        binding = { node, stage, mirror: undefined as any };
        bindings.set(data.id, binding);
        binding.mirror = attachViewerMirror({ pageId: data.id, container: stage, sendCommand: () => {},
          onViewport: (size) => { if (binding) binding.viewport = size; }, onStatus: options.onStatus });
      }
      binding.mirror.receive(data.packet);
    },
    setConnected(value: boolean) {
      connected = value;
      for (const binding of bindings.values()) { binding.mirror.setConnected(value); if (!value) binding.node.hidden = true; }
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame);
      for (const binding of bindings.values()) { binding.mirror.dispose(); binding.node.remove(); }
      bindings.clear();
    },
  };
}
